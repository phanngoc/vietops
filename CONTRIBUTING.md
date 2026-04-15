# Contributing to VietOps

## Development Setup

### Requirements
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose

### Quick Start
```bash
git clone https://github.com/phanngoc/vietops.git
cd vietops

# Copy env
cp .env.example .env
# Edit .env with your local values

# Start infrastructure
docker-compose up -d postgres redis

# Install dependencies
npm install

# Run migrations
npm run db:migrate
npm run db:seed  # seed demo data

# Start dev
npm run dev
```

## Branch Strategy

```
main          ← production, protected
develop       ← integration branch
feature/ST-XXX-short-description  ← feature branches
fix/TKT-XXX-short-description     ← bug fix branches
```

## Commit Message Format

```
type(scope): short description

Types: feat | fix | docs | style | refactor | test | chore
Scope: ticket | sla | portal | auth | github | asset | notification

Examples:
feat(ticket): add SLA breach email notification
fix(sla): correct timer pause logic during awaiting-customer status
docs(api): add ticket WebSocket events documentation
```

## Pull Request Process

1. Branch từ `develop`, không từ `main`
2. Link PR đến GitHub Issue tương ứng
3. Mọi PR phải có tests (unit hoặc integration)
4. CI phải pass: lint + typecheck + tests
5. Cần 1 reviewer approve trước khi merge
6. Squash merge vào `develop`

## Code Standards

- TypeScript strict mode
- ESLint + Prettier (run `npm run lint`)
- Zod cho tất cả input validation
- Prisma cho database queries (no raw SQL trừ khi cần optimize)
- Test coverage target: 70%+

## Issue Labels

| Label | Meaning |
|-------|---------|
| `epic` | High-level business goal |
| `story` | User story (as a user, I want...) |
| `feature` | Specific feature/capability |
| `task` | Technical implementation task |
| `bug` | Something is broken |
| `phase-1` | Phase 1 scope |
| `phase-2` | Phase 2 scope |
| `phase-3` | Phase 3 scope |
| `priority-critical` | Must have for next release |
| `priority-high` | Important, plan soon |
| `priority-medium` | Nice to have |
| `priority-low` | Backlog |
