# Architecture — VietOps

## 1. System Overview

VietOps là multi-tenant SaaS platform theo kiến trúc monolith-modular (Phase 1), sẵn sàng tách thành microservices (Phase 2+).

```
┌──────────────────────────────────────────────────────────────┐
│                         Clients                              │
│   Web Browser (Next.js)    │    Mobile App (React Native)   │
│   External Systems (Jira, AMIS HRM, BambooHR, Slack)        │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS / WSS
┌────────────────────────────▼─────────────────────────────────┐
│                      API Gateway / Reverse Proxy             │
│                    (Nginx / Cloudflare)                      │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                    Backend Application                       │
│                  (Node.js / Fastify)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Auth Module  │  │ Ticket Module│  │   SLA Engine     │  │
│  │ - JWT        │  │ - CRUD       │  │ - Timer tracking │  │
│  │ - Google SSO │  │ - Assignment │  │ - Breach detect  │  │
│  │ - RBAC       │  │ - Comments   │  │ - Escalation     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Workflow     │  │ Notification │  │ Integration Hub  │  │
│  │ Engine       │  │ Service      │  │ - Jira           │  │
│  │ - State      │  │ - Email      │  │ - Slack/Teams    │  │
│  │   machine    │  │ - Slack      │  │ - AMIS HRM       │  │
│  │ - Triggers   │  │ - In-app     │  │ - BambooHR       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Asset Module │  │ Report       │  │ Webhook          │  │
│  │ - CMDB lite  │  │ Service      │  │ Receiver         │  │
│  │ - Lifecycle  │  │ - Aggregation│  │ - HR events      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────┬───────────────┬──────────────────┬────────────-┘
             │               │                  │
    ┌────────▼───┐  ┌────────▼───┐    ┌────────▼────────┐
    │ PostgreSQL │  │   Redis    │    │  BullMQ Workers  │
    │ (main DB)  │  │ (cache +   │    │  - SLA timer     │
    │            │  │  sessions  │    │  - Email queue   │
    │            │  │  + queues) │    │  - Sync jobs     │
    └────────────┘  └────────────┘    └─────────────────-┘
```

---

## 2. Tech Stack Chi Tiết

### Frontend — Next.js 15
```
next.js 15 (App Router)
├── React 19
├── TypeScript 5
├── Tailwind CSS 3
├── shadcn/ui (component library)
├── TanStack Query v5 (data fetching + caching)
├── TanStack Table v8 (data tables)
├── React Hook Form + Zod (forms + validation)
├── Recharts (charts & dashboards)
├── Socket.io-client (real-time updates)
└── next-intl (i18n: vi/en)
```

### Backend — Node.js + Fastify
```
fastify 4
├── TypeScript 5
├── Prisma ORM (PostgreSQL)
├── Redis (ioredis)
├── BullMQ (job queues)
├── Nodemailer + MJML (email)
├── @slack/webhook (Slack notifications)
├── jsonwebtoken + bcrypt (auth)
├── zod (validation)
├── pino (logging)
└── vitest (testing)
```

### Database
```
PostgreSQL 16
├── Row-level security cho multi-tenancy
├── JSONB cho metadata/config linh hoạt
├── pg_cron cho scheduled jobs (optional)
└── Prisma Migrate cho schema management

Redis 7
├── Session store
├── API response caching
├── SLA timer state
└── BullMQ queues backend
```

---

## 3. Multi-tenancy Architecture

**Approach**: Shared database, tenant isolation via `organization_id` + Row Level Security (RLS)

```sql
-- Every table has organization_id
CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  ...
);

-- RLS Policy
CREATE POLICY tenant_isolation ON tickets
  USING (organization_id = current_setting('app.organization_id')::UUID);
```

**Pros**: Đơn giản, cost-efficient cho MVP  
**Cons**: Một tenant lớn có thể ảnh hưởng performance  
**Migration path**: Schema-per-tenant hoặc DB-per-tenant khi scale

---

## 4. SLA Engine

SLA Engine là core component, hoạt động độc lập với ticket CRUD:

```
Ticket Created
     │
     ▼
SLA Policy Matcher
(match by category + priority + org SLA config)
     │
     ▼
SLA Timer Created (stored in DB + Redis)
     │
     ├── Response SLA: "Acknowledge by X hours"
     └── Resolution SLA: "Resolve by Y hours"
          │
          ▼
     BullMQ Job Scheduler
          │
          ├── Job at 50% time → Check status → Send warning if still open
          ├── Job at 75% time → Check status → Send escalation
          ├── Job at 100% time → Mark SLA breached → Notify manager
          └── Job at resolution → Calculate actual time → Update SLA record
```

**SLA Pause/Resume**: Khi ticket ở trạng thái "Awaiting Customer Response", timer dừng lại.

---

## 5. Workflow Engine

State machine đơn giản cho Phase 1, có thể mở rộng thành visual builder (Phase 3):

```typescript
type WorkflowTrigger =
  | { type: 'ticket.created'; conditions: ConditionSet }
  | { type: 'ticket.status_changed'; from: Status; to: Status }
  | { type: 'employee.created'; source: 'amis' | 'bamboohr' }
  | { type: 'schedule'; cron: string }
  | { type: 'webhook'; source: string }

type WorkflowAction =
  | { type: 'create_ticket'; template: TicketTemplate }
  | { type: 'assign_task'; assignee: AssigneeRule }
  | { type: 'send_notification'; channel: Channel; template: string }
  | { type: 'update_ticket'; fields: Partial<Ticket> }
  | { type: 'call_webhook'; url: string; payload: object }
  | { type: 'create_jira_issue'; project: string; template: JiraTemplate }
```

---

## 6. Integration Architecture

### Jira Integration
```
VietOps Ticket ←→ Jira Issue

OAuth 2.0 flow cho authentication
Bi-directional sync via:
  - VietOps → Jira: Create issue, update status, add comment
  - Jira → VietOps: Webhook for status changes

Sync Worker (BullMQ):
  - Queue: jira-sync
  - Retry: 3 lần với exponential backoff
  - Conflict resolution: "last write wins" với timestamp check
```

### AMIS HRM Integration
```
AMIS HRM → VietOps (Webhook push)

Events received:
  - employee.created → trigger onboarding workflow
  - employee.terminated → trigger offboarding workflow
  - employee.leave_approved → update availability

Webhook endpoint: POST /api/webhooks/amis
Authentication: HMAC signature verification
```

### Email Intake
```
Inbound email → Email parser service
  - Parse subject, body, attachments
  - Extract sender email → lookup user
  - Create ticket với parsed content
  - Reply to sender với ticket number

Implementation: SendGrid Inbound Parse / Mailgun Routes
```

---

## 7. Deployment Architecture (Phase 1 MVP)

```
┌─────────────────────────────────────────┐
│              Cloudflare                 │
│  DNS + CDN + DDoS protection + WAF      │
└──────────────────┬──────────────────────┘
                   │
          ┌────────▼────────┐
          │    Railway.app  │
          │                 │
          │  ┌───────────┐  │
          │  │  Next.js  │  │  (Web service)
          │  └───────────┘  │
          │  ┌───────────┐  │
          │  │  Fastify  │  │  (API service)
          │  └───────────┘  │
          │  ┌───────────┐  │
          │  │  Workers  │  │  (BullMQ workers)
          │  └───────────┘  │
          │  ┌───────────┐  │
          │  │PostgreSQL │  │  (Managed DB)
          │  └───────────┘  │
          │  ┌───────────┐  │
          │  │   Redis   │  │  (Managed Redis)
          │  └───────────┘  │
          └─────────────────┘
```

**Phase 2+**: Migrate sang AWS/GCP với:
- ECS Fargate hoặc GKE cho container orchestration
- RDS PostgreSQL với read replicas
- ElastiCache Redis cluster
- CloudFront CDN
- S3 cho file attachments

---

## 8. Security Architecture

### Authentication Flow
```
1. User login → POST /auth/login
2. Verify credentials (bcrypt)
3. Generate access token (JWT, 15 phút) + refresh token (7 ngày)
4. Store refresh token in Redis (revocable)
5. Client stores: access token in memory, refresh token in httpOnly cookie
6. API requests: Bearer token in Authorization header
7. Middleware: verify JWT → extract org_id + user_id → set RLS context
```

### Data Security
- **Encryption at rest**: PostgreSQL encryption (provider-level)
- **Encryption in transit**: TLS 1.3 enforced
- **Secrets management**: Environment variables, Railway secrets
- **API rate limiting**: 100 req/min per user, 1000 req/min per org
- **Input validation**: Zod schemas cho mọi API endpoint
- **SQL injection**: Prisma ORM parameterized queries
- **XSS**: Content-Security-Policy headers, React auto-escaping
- **CSRF**: SameSite cookie, CSRF token cho form submissions

---

## 9. Monitoring & Observability

```
Logs → Pino (structured JSON) → Logtail / Datadog
Metrics → Prometheus → Grafana
Errors → Sentry (frontend + backend)
Uptime → Better Uptime
APM → OpenTelemetry traces
```

**Key dashboards**:
- SLA breach rate real-time
- API latency p50/p95/p99
- Queue depth & processing rate
- Active connections per tenant
- Error rate by endpoint
