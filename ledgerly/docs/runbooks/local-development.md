# 本地开发手册

## 启动

```bash
cp .env.example .env
docker compose -f infrastructure/docker/compose.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

## 验证首个竖切

```bash
curl -X POST http://localhost:3001/v1/tenants/bootstrap \
  -H 'content-type: application/json' \
  -H 'x-user-id: 10000000-0000-4000-8000-000000000001' \
  -d '{"tenantName":"试点工作台","company":{"name":"常州市示例网络科技有限公司","unifiedSocialCreditCode":"913204001234567890","provinceCode":"32","cityCode":"3204"}}'
```

响应中的 `tenantId` 用于后续请求的 `x-tenant-id`。跨租户读取统一返回 404，并写入拒绝审计事件，避免泄露资源是否存在。
