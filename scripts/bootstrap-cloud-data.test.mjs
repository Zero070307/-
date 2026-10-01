import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeState, validateState } from './bootstrap-cloud-data.mjs';

test('bootstrap validation accepts only student and attendance arrays', () => {
  assert.deepEqual(validateState({ students: [], history: [] }), { students: [], history: [] });
  assert.throws(() => validateState({ students: {}, history: [] }), /students/);
  assert.throws(() => validateState({ students: [] }), /history/);
});

test('bootstrap summary contains counts only', () => {
  assert.equal(summarizeState({ students: [{ id: 's1' }], history: [{ id: 'h1' }] }), '准备导入：1 名学员，1 条签到记录');
});
