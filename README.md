# 墨鱼画室管理系统

用于管理学员、课时、签到记录和学员档案。业务数据保存到 Supabase 云端数据库，不依赖手机浏览器缓存。

## 正式使用

请通过 [墨鱼画室管理系统](https://zero070307.github.io/-/) 打开页面，并将这个链接保存为书签。

- 第一次打开时输入管理员账号和四位口令；登录状态最长保留 30 天。
- 登录后会从云端载入数据。新增、编辑、签到、删除和导入都会自动同步。
- 重要操作后，请等待顶部状态显示“已同步到云端”。
- “导出”可下载 JSON 备份；重要调整前建议导出一份留存。
- “数据恢复”可恢复最近 30 天内保存的快照；恢复前系统会再自动创建一个快照。

> 不要直接双击电脑临时目录中的 `index.html`，也不要使用旧下载文件。它们可能无法访问云端服务或不是最新版本。请始终使用上面的网页链接。

## 数据与隐私

- 学员资料、签到记录和管理员口令不会写入公开的 HTML、README 或 GitHub 当前页面文件。
- 浏览器仅保存短期登录会话，不把学员业务数据作为本地数据源。
- 如需更换设备，使用同一个网页链接登录即可加载云端数据。

## 文件说明

- `index.html`：GitHub Pages 正式页面源文件。
- `teacher-app.html`：与正式页面同步的功能测试页面。
- `使用教程.txt`：更详细的日常使用说明。
- `书签更新教程.txt`：更新手机或电脑书签的说明。

## 管理员维护说明

1. 在 Supabase 项目中按文件名顺序执行 `supabase/migrations/` 下的所有迁移，部署 `api` Edge Function。
2. 将 `supabase/config.toml` 一并部署；该文件让 API 使用自己的登录与会话校验。
3. 只在 Supabase Edge Function Secrets 中保存管理员账号、管理员口令和服务端密钥。不要把这些值写进 HTML、README、Git 提交或截图。
4. 初始数据仅可由本机私有的 `embedded_data.json` 使用 `scripts/bootstrap-cloud-data.mjs` 导入一次。该文件已被 `.gitignore` 排除，不能提交。
5. 忘记管理员口令时，由项目所有者在 Supabase 后台更新；页面不提供邮箱找回或自助注册。

## 验证

```powershell
node tests/student-management-logic.test.mjs
node --test js/cloud-api.test.mjs
node --test scripts/bootstrap-cloud-data.test.mjs
node --test tests/cloud-migration.test.mjs
```
