create extension if not exists pgcrypto;

create table public.students (
  id text primary key,
  student_no text,
  name text not null,
  phone text,
  class_name text not null default '',
  note text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.student_courses (
  student_id text not null references public.students(id) on delete cascade,
  course_type text not null,
  hours integer not null check (hours >= 0),
  primary key (student_id, course_type)
);

create table public.attendance_records (
  id text primary key,
  student_id text not null,
  student_name text not null,
  class_name text not null default '',
  course text not null,
  attended_at timestamptz not null,
  remain_hours integer not null,
  note text not null default '',
  archive_name text
);

create table public.app_state_meta (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0,
  bootstrapped boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_state_meta (singleton) values (true)
on conflict (singleton) do nothing;

create table public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  state jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.admin_credentials (
  id boolean primary key default true check (id),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.login_attempts (
  client_key text primary key,
  attempts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.current_app_state()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'studentNo', s.student_no,
        'name', s.name,
        'phone', s.phone,
        'className', s.class_name,
        'courses', coalesce((
          select jsonb_agg(jsonb_build_object('type', c.course_type, 'hours', c.hours) order by c.course_type)
          from public.student_courses c where c.student_id = s.id
        ), '[]'::jsonb),
        'note', s.note,
        'createdAt', s.created_at,
        'archived', s.archived
      ) order by s.created_at), '[]'::jsonb)
      from public.students s
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'studentId', h.student_id,
        'studentName', h.student_name,
        'className', h.class_name,
        'course', h.course,
        'time', h.attended_at,
        'remainHours', h.remain_hours,
        'note', h.note,
        'archiveName', h.archive_name
      ) order by h.attended_at), '[]'::jsonb)
      from public.attendance_records h
    )
  );
$$;

create or replace function public.replace_app_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_state->'students') <> 'array' or jsonb_typeof(p_state->'history') <> 'array' then
    raise exception 'State must include students and history arrays';
  end if;

  delete from public.attendance_records;
  delete from public.students;

  insert into public.students (id, student_no, name, phone, class_name, note, archived, created_at)
  select
    item->>'id',
    nullif(item->>'studentNo', ''),
    coalesce(nullif(item->>'name', ''), '未命名学员'),
    nullif(item->>'phone', ''),
    coalesce(item->>'className', ''),
    coalesce(item->>'note', ''),
    coalesce((item->>'archived')::boolean, false),
    coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(p_state->'students') item;

  insert into public.student_courses (student_id, course_type, hours)
  select
    student_item->>'id',
    coalesce(nullif(course_item->>'type', ''), '常规课'),
    greatest(coalesce((course_item->>'hours')::integer, 0), 0)
  from jsonb_array_elements(p_state->'students') student_item
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(student_item->'courses') = 'array' then student_item->'courses'
    else jsonb_build_array(jsonb_build_object(
      'type', coalesce(student_item->>'course', '常规课'),
      'hours', coalesce(student_item->>'hours', '0')
    )) end
  ) course_item
  on conflict (student_id, course_type) do update set hours = excluded.hours;

  insert into public.attendance_records (id, student_id, student_name, class_name, course, attended_at, remain_hours, note, archive_name)
  select
    item->>'id',
    coalesce(item->>'studentId', ''),
    coalesce(item->>'studentName', ''),
    coalesce(item->>'className', ''),
    coalesce(item->>'course', '常规课'),
    coalesce(nullif(item->>'time', '')::timestamptz, now()),
    coalesce((item->>'remainHours')::integer, 0),
    coalesce(item->>'note', ''),
    nullif(item->>'archiveName', '')
  from jsonb_array_elements(p_state->'history') item;
end;
$$;

create or replace function public.get_current_state()
returns table(state jsonb, version bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select public.current_app_state(), m.version from public.app_state_meta m where m.singleton = true;
end;
$$;

create or replace function public.save_state_with_snapshot(p_state jsonb, p_reason text, p_expected_version bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare current_version bigint;
begin
  select version into current_version from public.app_state_meta where singleton = true for update;
  if current_version <> p_expected_version then
    raise exception 'stale state version';
  end if;
  insert into public.app_snapshots (state, reason) values (public.current_app_state(), left(coalesce(p_reason, '更新数据'), 120));
  perform public.replace_app_state(p_state);
  update public.app_state_meta set version = current_version + 1, updated_at = now() where singleton = true;
  delete from public.app_snapshots where created_at < now() - interval '30 days';
  return current_version + 1;
end;
$$;

create or replace function public.restore_snapshot_with_snapshot(p_snapshot_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare snapshot_state jsonb;
declare current_version bigint;
begin
  select version into current_version from public.app_state_meta where singleton = true for update;
  select state into snapshot_state from public.app_snapshots where id = p_snapshot_id;
  if snapshot_state is null then raise exception 'snapshot not found'; end if;
  insert into public.app_snapshots (state, reason) values (public.current_app_state(), '恢复前自动快照');
  perform public.replace_app_state(snapshot_state);
  update public.app_state_meta set version = current_version + 1, updated_at = now() where singleton = true;
  delete from public.app_snapshots where created_at < now() - interval '30 days';
  return current_version + 1;
end;
$$;

create or replace function public.bootstrap_state_once(p_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare current_version bigint;
declare already_bootstrapped boolean;
begin
  select version, bootstrapped into current_version, already_bootstrapped from public.app_state_meta where singleton = true for update;
  if already_bootstrapped then raise exception 'initial import already completed'; end if;
  perform public.replace_app_state(p_state);
  update public.app_state_meta set bootstrapped = true, version = current_version + 1, updated_at = now() where singleton = true;
  return current_version + 1;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.get_current_state() to service_role;
grant execute on function public.save_state_with_snapshot(jsonb, text, bigint) to service_role;
grant execute on function public.restore_snapshot_with_snapshot(uuid) to service_role;
grant execute on function public.bootstrap_state_once(jsonb) to service_role;
