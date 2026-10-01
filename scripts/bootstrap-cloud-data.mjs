import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.students)) throw new Error('初始数据缺少 students 数组');
  if (!Array.isArray(value.history)) throw new Error('初始数据缺少 history 数组');
  return { students: value.students, history: value.history };
}

export function summarizeState(state) {
  return `准备导入：${state.students.length} 名学员，${state.history.length} 条签到记录`;
}

export async function bootstrap({ dataFile, apiUrl, secret, fetchImpl = fetch, log = console.log }) {
  if (!dataFile) throw new Error('请提供私有初始数据文件路径');
  if (!apiUrl) throw new Error('缺少 CLOUD_API_URL 环境变量');
  if (!secret) throw new Error('缺少 BOOTSTRAP_SECRET 环境变量');
  const state = validateState(JSON.parse(await fs.readFile(dataFile, 'utf8')));
  log(summarizeState(state));
  const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bootstrap-secret': secret },
    body: JSON.stringify(state),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `初始导入失败（HTTP ${response.status}）`);
  log('初始导入已完成。');
  return body;
}

const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) {
  bootstrap({
    dataFile: process.argv[2] || process.env.INITIAL_DATA_FILE,
    apiUrl: process.env.CLOUD_API_URL,
    secret: process.env.BOOTSTRAP_SECRET,
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
