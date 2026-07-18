# ADR 0002: Database Framework Selection

## Context and Problem Statement
Phase 9 requires migrating mutable Controller state (sessions, workspaces, tasks, plans, evidence, checkpoints, leases, rates, and audit logs) to a durable PostgreSQL database. We need to choose the most appropriate framework for PostgreSQL access in our TypeScript codebase.

## Decision Drivers
1. **Lightweight & High Performance**: Connection pool overhead and run-time processing should be minimized.
2. **Minimal Dependencies**: We should choose the smallest footprint that fully meets requirements.
3. **No Custom ORMs**: We must use established, standard libraries.
4. **Migration & Transaction Support**: Support explicit transactional migrations and ACID transactions.
5. **Type Safety**: Provide type-safe interfaces for queries and parameters.

## Proposed Options

### 1. `pg` (with `@types/pg`) & Direct SQL + Custom SQL Migration Runner (Recommended)
- **Description**: The official Node.js PostgreSQL driver (`pg`). We implement type-safe repositories, explicit parameterized queries, and a standard SQL migration runner executing inside transactions.
- **Pros**:
  - Zero compilation or generation overhead.
  - Zero heavy schemas, dependencies, or runtime layers.
  - Native, direct access to all PostgreSQL capabilities (like `SELECT ... FOR UPDATE`, advisory locks, and transactional DDL).
  - High performance, maximum control, and standard connection pooling.
- **Cons**:
  - Manual mapping of SQL result rows to TypeScript interfaces (we can solve this with simple type casting/Zod parse).

### 2. Drizzle ORM (`drizzle-orm` & `drizzle-kit`)
- **Description**: A modern TypeScript ORM with a schema generator and migration kit.
- **Pros**:
  - Automated migration SQL file generation.
  - High degree of type safety for queries.
- **Cons**:
  - Pulls in multiple dependencies (`drizzle-orm`, `drizzle-kit`, and transitive packages).
  - Additional build/generation step required (`drizzle-kit generate`), introducing complexity to CI and production Docker builds.

## Decision Outcome
We choose **Option 1 (`pg` / `@types/pg`)** as it represents the smallest, most direct option satisfying all requirements with zero code generation overhead. We will write clean SQL DDL migrations and a transaction-aware migration runner in TypeScript. We will use Zod schemas (already present in the codebase) for input/output sanitization and validation.
