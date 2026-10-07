# ADR-0002：使用 Drizzle ORM 与 PostgreSQL

- 状态：已接受
- 日期：2026-10-07

## 决策

V1 使用 PostgreSQL 17 和 Drizzle ORM。迁移 SQL 必须进入版本控制，生产变更遵循 expand → migrate → switch → contract。

## 原因

财务系统需要事务、精确数值、约束和可检查的 SQL。Drizzle 保留接近 SQL 的数据访问方式，并在 TypeScript 中提供静态类型。

## 后果

领域层不得依赖 Drizzle。仓储负责映射领域实体；禁止把 ORM 行对象直接返回给 Controller 或前端。
