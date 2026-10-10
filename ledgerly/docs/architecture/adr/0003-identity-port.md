# ADR-0003：正式身份使用可替换 OIDC Provider

- 状态：已接受
- 日期：2026-10-09
- 决策阶段：R5 正式身份与权限

## 背景与约束

平台同时服务企业用户与运营/财税专业人员，必须支持会话撤销、租户邀请、职责分离和高风险操作二次验证。产品面向中国大陆，身份数据驻留、跨境依赖和供应商退出能力优先于短期接入速度。业务服务不得接触密码、短信验证码、TOTP 种子、WebAuthn 私钥或供应商 SDK。

## 方案比较

| 方案 | 注册/登录与密码责任 | MFA 与会话撤销 | 数据驻留 | 迁移和退出 |
| --- | --- | --- | --- | --- |
| 海外托管身份（如 Auth0 公有云） | 供应商负责凭证和登录面，接入快 | 能力成熟，但管理 API、区域和网络可用性形成运行依赖 | 上线前需逐项确认可用区域、跨境和合同 | 标准 OIDC 令牌可迁移，但密码哈希通常不能通过普通导出完整取得 |
| 国内托管 IDaaS | 供应商负责凭证和 MFA，本地网络与合规支持更直接 | 通常提供 OIDC 和管理能力，具体撤销语义需按供应商验收 | 可选择大陆地域，但仍需合同、子处理者和导出审查 | 供应商管理 API 差异较大，必须保留适配层和批量导出验收 |
| 自托管 Keycloak | 平台承担升级、可用性、密钥和备份，Keycloak 承担凭证校验 | 原生 OIDC、会话管理、OTP/WebAuthn；应用仍需短令牌和本地撤销闸门 | 可部署在受控大陆基础设施，位置和备份由平台决定 | 标准 OIDC/JWKS，用户、角色和配置可导出；退出路径最清晰 |
| 应用内自建密码体系 | 平台承担全部密码学、找回、防撞库和 MFA 风险 | 研发面最广，最容易产生安全缺口 | 完全可控 | 数据可迁移，但长期安全和审计成本最高 |

## 决策

1. V1 生产目标选择 **自托管 Keycloak + 标准 OIDC Authorization Code Flow with PKCE**。本 ADR 只确定身份边界；Keycloak 的真实部署、集群、备份和升级演练属于 R6/R7。
2. API 只依赖 `IdentityProviderPort`：验证访问令牌、读取稳定的 `issuer + subject`、查询认证时间/方法并请求撤销 Provider 会话。禁止在领域层、应用服务或 React 组件引用 Keycloak SDK。
3. 平台维护自己的 `AppUser`、`ExternalIdentity`、`TenantMember`、角色、公司作用域和 `AuthSession` 投影。Provider 只证明“是谁、何时及如何认证”，不得成为租户授权真相来源。
4. 浏览器使用 BFF/HttpOnly Secure SameSite Cookie；访问令牌不得写入 LocalStorage。API 使用短时访问令牌，本地会话记录可立即阻断已撤销会话，并与 OIDC back-channel logout/Provider 撤销共同生效。
5. 密码、找回码、OTP 种子和 WebAuthn 私钥只由 Provider 保存。平台仅保存 Provider subject、会话标识、认证方法、认证时间、撤销状态和必要审计元数据。
6. MFA/二次验证以令牌 `auth_time`、认证方法和本地一次性 step-up grant 共同判定；规则批准/撤回、申报包冻结、调整工单解决和反结账批准不得只凭角色放行。
7. 租户邀请由平台生成一次性哈希令牌；接受邀请后才创建/激活成员关系。企业租户角色与平台运营角色分表存储，禁止把 `platform_admin` 写入普通租户成员。
8. `development-headers` 仅允许 `NODE_ENV != production && STORAGE_MODE=memory && AUTH_MODE=development-headers`。生产和持久化模式必须使用 OIDC；测试适配器不得被生产依赖图加载。

## 审计要求

- 登录成功/失败、登出、全会话撤销、邀请创建/接受/撤回、成员停用、角色和公司作用域变化、MFA 注册/移除、step-up 成功/失败都写追加式审计。
- 审计记录保存 actor、tenant、目标用户、Provider issuer、session id、trace id、结果和原因；不得记录令牌、验证码、密码或完整手机号/邮箱。
- 租户授权先校验有效成员，再校验权限域、角色、公司作用域，最后校验高风险操作所需的 step-up 新鲜度。

## 迁移与退出策略

- `ExternalIdentity` 使用 `(issuer, subject)` 唯一键，本地用户 ID 永不等同于 Provider subject，因此可并存和迁移多个 Provider。
- 每季度验证用户、身份链接、角色、会话撤销记录和 Keycloak realm 配置的可读导出；密钥只通过受控密钥管理迁移。
- 更换 Provider 时先双读验证、再为同一 `AppUser` 追加新身份链接，最后撤销旧 Provider 会话；不得批量改写业务表中的 actor id。
- 若未来改用国内托管 IDaaS，只新增 Adapter 和部署 ADR，不改变领域模型、租户授权表或业务 API。

## 参考

- Keycloak Server Administration Guide（OIDC、会话撤销、OTP/WebAuthn）：https://www.keycloak.org/docs/latest/server_admin/
- Auth0 Session Revocation API：https://auth0.com/docs/api/management/v2/sessions/revoke-session
- Auth0 Data Export and Transfer Policy：https://auth0.com/docs/troubleshoot/customer-support/operational-policies/data-export-and-transfer-policy
- 阿里云 IDaaS OIDC 联邦认证：https://help.aliyun.com/zh/idaas/eiam/user-guide/bind-oidc-identity-provider/

## 后果

R5 后续实现必须先落地本地用户/身份/成员/会话模型，再接登录回调和撤销，不允许用开发请求头冒充正式登录。自托管 Provider 增加运维责任，但换取大陆部署位置控制、标准协议和明确退出路径。
