# 教师学员管理系统

学员、课时、签到和档案管理页面。GitHub Pages 继续提供原来的访问链接；登录后的业务数据以 Supabase 云端数据库为准，不依赖手机浏览器缓存。

## 使用

- `index.html`：正式使用页面。
- `teacher-app.html`：与正式页面同步的测试页面。
- 输入管理员账号与四位口令后，页面从云端加载数据；登录会话最长保留 30 天。
- 新增、编辑、签到、删除与导入会自动同步。网络不稳定时请等待顶部显示“已同步到云端”。
- “导出”下载 JSON 备份；重大操作前建议保留一份。
- “数据恢复”可恢复最近 30 天内任一次修改前的快照；恢复前会自动再创建一个快照。

## 管理员部署说明

1. 在 Supabase 项目中执行 `supabase/migrations/202610010001_cloud_state.sql`，部署 `api` Edge Function。
2. 仅在 Supabase Edge Function Secrets 中配置管理员账号、管理员口令、服务端密钥和初始导入密钥。不要把这些值写入 HTML、README、Git 提交或截图。
3. 在 `index.html` 与 `teacher-app.html` 的 `TEACHER_APP_CLOUD_API_URL` 配置为部署后的 Edge Function 地址。
4. 用本机私有的 `embedded_data.json` 运行 `scripts/bootstrap-cloud-data.mjs` 一次性导入。该文件已被 `.gitignore` 排除，不能提交。
5. 忘记口令时，由项目所有者在 Supabase 后台更新管理员凭据；页面不提供邮箱找回或自助注册。

## 验证

```powershell
node tests/student-management-logic.test.mjs
node --test js/cloud-api.test.mjs
node --test scripts/bootstrap-cloud-data.test.mjs
```

## 隐私

当前及之后发布的页面、测试与文档不应包含真实学员资料、导出备份、口令、会话令牌或 Supabase 服务端密钥。旧 Git 历史不在本次清理范围内。
