# VietOps — Project Instructions

## Overview

VietOps is an IT Service Management (ITSM) platform for Vietnamese IT outsourcing companies, built as a monorepo with npm workspaces + Turborepo.

## Tech Stack

- **Backend**: Fastify 5, TypeScript strict, Prisma ORM, Zod validation, BullMQ, Redis, PostgreSQL 16
- **Frontend**: Next.js 15, React 19, Tailwind CSS, TanStack Query, shadcn/ui
- **Shared**: `@vietops/shared` — types, constants, Zod schemas
- **Infra**: Docker Compose (dev), GitHub Actions CI

## Project Structure

```
vietops/
├── apps/api/          — Fastify backend
├── apps/web/          — Next.js frontend
├── packages/shared/   — Shared types & constants
├── claudedocs/        — Knowledge base (plans, reviews, QA, decisions, standups)
└── docs/              — Project documentation (PRD, architecture, roadmap)
```

## Code Conventions

### General
- TypeScript strict mode, no `any`, no `ts-ignore`
- Zod for all validation (env, request, response)
- kebab-case for file names, camelCase for variables/functions, PascalCase for types/classes
- ESM modules (`"type": "module"`)

### Backend (apps/api)
- Fastify plugin pattern — each module exports a plugin via `fastify-plugin`
- Route files export an async function registered with prefix
- All routes validate input with Zod schemas
- Prisma for database, migrations via `prisma migrate dev`
- Multi-tenant: every query scoped by `organizationId`
- Error responses: `{ error: string, message: string, statusCode: number }`

### Frontend (apps/web)
- Next.js App Router (no Pages Router)
- Server Components by default, `'use client'` only when needed
- TanStack Query for data fetching
- shadcn/ui components in `components/ui/`
- Tailwind CSS with brand color tokens

### Testing
- Vitest for backend unit/integration tests
- Tests in `src/**/*.test.ts` (colocated)
- Use `app.inject()` for Fastify route testing
- No mocking database — use test database

## Workflow Skills (`/vops:*`)

Team workflow simulating a real dev team:

| Skill | Role | Purpose |
|-------|------|---------|
| `/vops:plan <issue>` | Tech Lead | Analyze issue, design solution, create plan |
| `/vops:impl <plan>` | Senior Dev | Implement from plan, incremental commits |
| `/vops:review <branch>` | Reviewer | 6-dimension code review |
| `/vops:qa <branch>` | QA Engineer | Automated + edge case testing |
| `/vops:discuss <topic>` | Team | Standup, design discussion, ADR, retro |
| `/vops:sprint <issue>` | Orchestrator | Full Plan→Implement→Review→QA→Ship |

### Knowledge Base (`claudedocs/`)
- `plans/` — Solution design documents (PLAN-{issue}-{name}.md)
- `reviews/` — Code review reports (REVIEW-{branch}.md)
- `qa-reports/` — QA test reports (QA-{branch}.md)
- `decisions/` — Architecture Decision Records (ADR-{number}-{name}.md)
- `standups/` — Daily standup notes

## Development Commands

```bash
npm run dev          # Start all apps (Turborepo)
npm run build        # Build all apps
npm run lint         # Lint all apps
npm run typecheck    # Type check all apps
npm run test         # Run all tests
npm run db:migrate   # Run Prisma migrations (API)
npm run db:seed      # Seed database (API)
```

## Environment Setup

1. Copy `.env.example` to `.env` in `apps/api/`
2. Start services: `docker compose up -d`
3. Run migrations: `npm run db:migrate`
4. Start dev: `npm run dev`

## Multi-Tenant Architecture

- Every database table has `organization_id` column
- All queries MUST be scoped by `organizationId`
- JWT payload includes `organizationId` for automatic scoping
- SLA policies are per-organization

## Git Workflow

- Feature branches: `feature/{issue-number}-{short-description}`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- PR required for main, CI must pass
