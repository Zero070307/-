begin;

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

  delete from public.attendance_records where true;
  delete from public.students where true;

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

commit;
