import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../supabase/migrations/202610010001_cloud_state.sql', import.meta.url);

test('state replacement uses explicit all-row predicates for Supabase safe-update mode', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(sql, /delete from public\.attendance_records where true;/i);
  assert.match(sql, /delete from public\.students where true;/i);
});
