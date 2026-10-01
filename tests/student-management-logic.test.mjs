import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function embeddedData(html, fileName) {
  const match = html.match(/<script type="application\/json" id="embedded-data">([\s\S]*?)<\/script>/);
  assert.ok(match, `${fileName} has an embedded-data block`);
  return match[1].trim();
}

function loadLogic() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/\/\* TESTABLE_LOGIC_START \*\/([\s\S]*?)\/\* TESTABLE_LOGIC_END \*\//);
  assert.ok(match, 'testable logic block is missing');
  const context = {};
  vm.runInNewContext(match[1], context);
  return context;
}

const logic = loadLogic();

{
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /ADMIN_PASSCODE=/, 'README does not include a deployable passcode secret');

  for (const fileName of ['index.html', 'teacher-app.html']) {
    const html = fs.readFileSync(new URL(`../${fileName}`, import.meta.url), 'utf8');
    assert.equal(embeddedData(html, fileName), '', `${fileName} has no built-in student or attendance data`);
    assert.match(html, /数据恢复/, `${fileName} includes the recovery entry point`);
    assert.match(html, /cloudApi\.listSnapshots/, `${fileName} loads recovery snapshots from the cloud`);
    assert.match(html, /cloudApi\.getState/, `${fileName} loads business data from the cloud`);
    assert.doesNotMatch(html, /localStorage\.(getItem|setItem).*students|teacher_app_students|teacher_app_history/, `${fileName} does not use browser storage for business data`);
  }
}

{
  const student = { courses: [{ type: '常规课', hours: 5 }, { type: '集训课', hours: 2 }] };
  assert.equal(logic.getStudentTotalHours(student), 7, 'total hours adds every course');
  assert.equal(logic.isLowHoursStudent(student), true, 'one low course triggers the alert');
  assert.equal(logic.normalizeClassName('  周六班  '), '周六班', 'class names are trimmed');
  assert.equal(logic.isValidCnMobile('13800138000'), true, 'valid mainland mobile is accepted');
  assert.equal(logic.isValidCnMobile('12345678901'), false, 'invalid phone prefix is rejected');
  assert.deepEqual(
    JSON.parse(JSON.stringify(logic.paginate([1, 2, 3], 2, 2))),
    { items: [3], page: 2, totalPages: 2 },
    'pagination keeps the requested valid page',
  );
}

{
  assert.equal(typeof logic.removeHistoryRecord, 'function', 'attendance deletion operation is available');
  assert.equal(typeof logic.applyBatchSignin, 'function', 'batch attendance operation is available');

  const state = {
    students: [{ id: 's1', name: '小明', className: '周六班', courses: [{ type: '常规课', hours: 4 }] }],
    history: [{ id: 'h1', studentId: 's1', studentName: '小明', className: '周六班', course: '常规课' }],
  };
  assert.equal(logic.removeHistoryRecord(state, 'h1', false).state.students[0].courses[0].hours, 4, 'delete-only preserves remaining hours');
  assert.equal(logic.removeHistoryRecord(state, 'h1', true).state.students[0].courses[0].hours, 5, 'restore option adds one hour back');
  assert.equal(
    logic.applyBatchSignin(state, ['s1'], '常规课', '2026-09-29T12:00:00.000Z').history.length,
    2,
    'batch sign-in adds one attendance record',
  );
}

{
  assert.equal(typeof logic.filterStudents, 'function', 'student filtering operation is available');
  const list = [
    { id: 'old', name: '张三', className: 'A班', createdAt: '2026-01-01T00:00:00.000Z', courses: [{ type: '常规课', hours: 5 }] },
    { id: 'new', name: '李四', className: 'B班', createdAt: '2026-02-01T00:00:00.000Z', courses: [{ type: '集训课', hours: 2 }] },
  ];
  assert.deepEqual(
    Array.from(logic.filterStudents(list, { search: '', className: '', course: '', lowOnly: false, sort: 'created-desc' }).map(s => s.id)),
    ['new', 'old'],
    'recently created students sort first by default',
  );
  assert.deepEqual(
    Array.from(logic.filterStudents(list, { search: '', className: '', course: '', lowOnly: true, sort: 'created-desc' }).map(s => s.id)),
    ['new'],
    'low-hour filter returns students with any course at or below two hours',
  );
}

console.log('student-management logic checks passed');
