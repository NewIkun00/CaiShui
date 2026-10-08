# Ledgerly V1

一人公司记账报税平台 V1 工程，依据仓库上级目录中的产品蓝图与研发计划实施。

## 快速开始

1. 复制 `.env.example` 为 `.env`。
2. 运行 `docker compose -f infrastructure/docker/compose.yml up -d`。
3. 运行 `pnpm install`、`pnpm db:migrate`、`pnpm dev`。
4. 用户 Web：<http://localhost:3020>；API 文档：<http://localhost:3001/docs>。

开发态身份由 `x-user-id` 和 `x-tenant-id` 请求头提供，只能在 `AUTH_MODE=development-headers` 时启用。生产环境启动检查会拒绝该模式。

如果只是预览页面且本机没有 Docker，可使用 `STORAGE_MODE=memory` 启动 API。该模式的数据会在 API 重启时清空，且生产环境会拒绝启动。

## 工程门槛

提交前运行：

```bash
pnpm check
```

业务规则不得写在 Controller、React 组件、ORM Hook 或队列 Processor 中。架构决策见 `docs/architecture/adr`。
