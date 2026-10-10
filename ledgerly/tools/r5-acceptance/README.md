# R5 可复现身份验收

本目录只服务于 R5 正式身份与权限的测试环境验收，不是生产部署模板。它提供一条启动、一条验收和一条停止命令，并将证书、渲染后的 Realm、日志、PID 与报告写到已忽略的 `.data/`。任何真实密码、Cookie、令牌、OTP 种子或私钥都不得提交。

## 前置条件

- Node.js 22–24、pnpm 11；
- Docker Engine 与 Docker Compose v2；
- 默认端口 3001、3020、51025、55432、55433、58080、58443、59000 可用；
- 测试环境必须与生产数据隔离。

运行 `pnpm r5:acceptance:doctor` 会以 JSON 报告当前条件，不会启动服务或输出秘密。本机没有 Docker 时会安全失败；不得因此把真实环境验收标记为通过。

## 使用方法

1. 复制 `tools/r5-acceptance/.env.example` 为 `tools/r5-acceptance/.env`，只填测试秘密。`R5_AUTH_COOKIE_KEY` 必须是规范的 32 字节 Base64。
2. 执行 `pnpm r5:acceptance:start`。命令会渲染 Keycloak Realm、生成七天有效的本地 CA/服务器证书、启动两个隔离的 PostgreSQL 17、Keycloak 26.8、Mailpit，运行 `0000`–`0037`，并以正式 OIDC/PostgreSQL 模式启动 API 与 Web。
3. 执行 `pnpm r5:acceptance:run`。当前 runner 验证 Keycloak discovery、Mailpit API、API 登录/注册事务、PKCE S256、state 与 nonce 边界，并写入脱敏 JSON 报告。
4. 执行 `pnpm r5:acceptance:stop`。该命令停止本地 API/Web 和 acceptance Compose 项目，并删除该测试栈的临时卷；不会操作其他 Compose 项目。

可先运行 `pnpm r5:acceptance:test`，它只验证环境解析、秘密校验、Realm 渲染和报告脱敏，不需要 Docker。

## 无外部服务模拟

执行 `pnpm r5:acceptance:simulate` 会生成一天有效的本地 HTTPS 证书，临时启动模拟 OIDC/邮件服务、内存模式 API 和 3020 Web，并在结束后自动停止。该流程实际通过 API 验证 PKCE、签名 JWT、HttpOnly Cookie、注册邮件 action-token、未验证/重复邮箱、过期链接、OTP step-up、换账号拒绝、旧会话替换、Provider 撤销、跨租户/跨公司/低角色拒绝和成员停用即时失效。

模拟服务只用于开发和 CI，不是生产身份实现，也不能替代 Keycloak/PostgreSQL 真实验收。报告带有 `productionEvidence: false`，生成到 `.data/reports/`。模拟 OTP 固定来自测试环境变量，任何密码、验证码、密钥或 action-token 都不会写入报告。

V1 产品蓝图规定邮件为受控试点所需通道，短信可在试点后接入。短信供应商、实名主体、数据处理条款和存储地域未确定前，本目录不引入供应商 SDK；未来阿里云等服务必须通过 Port/Adapter 接入，业务数据库不得保存短信验证码。

首位平台管理员引导继续使用 `pnpm identity:seed-admin <active-user-uuid>`，并且必须显式设置一次性开关 `ALLOW_PLATFORM_ADMIN_BOOTSTRAP=true`。引导在顾问锁保护的单个事务中同时写入角色、全局审计和 `tenant_id=null` 的 Outbox；已有活动管理员、无效用户或任一写入失败都会回滚。自动测试可以验证这些事务边界，但最终验收仍必须在 PostgreSQL 17 中核对真实记录。

## 安全与范围边界

- Realm 模板中的用户和密码来自 `.env`，仓库只保留占位符；渲染结果权限应为仅当前用户可读。
- `ledgerly-session-revoker` 仅授予 `realm-management/manage-users`，不得授予 `realm-admin`。
- CA 仅用于本机 acceptance；应用通过 `NODE_EXTRA_CA_CERTS` 精确信任该 CA，不允许关闭 TLS 校验。
- 当前 runner **尚不代表 R5 完成**。邮箱 action-token、OTP step-up、换账号拒绝、登出 Provider 撤销、跨租户/跨公司/低角色矩阵和平台角色治理 E2E 仍须按研发计划 28.22 逐项实现并重新运行。
- `simulate` 已覆盖上述前四类流程的本地 HTTP 模拟；`run` 仍需在真实 Keycloak/PostgreSQL 栈上重放。平台首位管理员、全局角色治理和 audit/outbox 仍只接受 PostgreSQL 真实证据。
- 报告会按字段名和 URL 参数脱敏；仍应在提交前人工检查 `.data/reports`，且 `.data/` 永远不得加入 Git。
