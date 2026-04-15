# Product Roadmap — VietOps

## Timeline Overview

```
2026
Jan ──────────── Apr ──────────── Jul ──────────── Oct ──────────── Jan 2027
│                │                │                │                │
│◄── Phase 1 ───►│◄───── Phase 2 ──────────────────►◄─── Phase 3 ──►│
│  Core ITSM     │   Developer Lifecycle            │  Intelligence  │
│  (Month 1–3)   │   (Month 4–6)                    │  & Scale       │
│                │                                  │  (Month 7–12)  │
```

---

## Phase 1: Core ITSM (Tháng 1–3)

**Goal**: Thay thế email + Excel cho IT request management. Đủ tính năng để bán cho khách hàng đầu tiên.

### Month 1 — Foundation
- [ ] Project setup: monorepo, CI/CD, staging environment
- [ ] Auth system: JWT, Google SSO, RBAC (4 roles)
- [ ] Organization management: create org, invite members
- [ ] Database schema v1: tickets, users, orgs, categories
- [ ] Basic ticket CRUD API
- [ ] Self-service portal UI (Next.js): submit ticket, view status

### Month 2 — Core Features
- [ ] Ticket workflow: status machine, assignment rules
- [ ] SLA engine: policy config, timer, breach detection
- [ ] Email notifications: ticket updates, SLA warnings
- [ ] Slack integration: webhook notifications
- [ ] Email intake: email → ticket auto-creation
- [ ] Agent dashboard: queue view, SLA countdown, bulk actions
- [ ] Service catalog: catalog items, dynamic forms

### Month 3 — Polish & Integrations
- [ ] GitHub Issues integration: OAuth, link ticket ↔ issue, status sync
- [ ] Reports: SLA compliance, ticket volume, MTTR
- [ ] Report export: PDF, CSV
- [ ] Admin panel: org settings, SLA policy config, team management
- [ ] Performance optimization: caching, query optimization
- [ ] Security: audit log, rate limiting, pen test basics
- [ ] Vietnamese localization: full UI in vi/en
- [ ] Customer onboarding guide

**Phase 1 Deliverable**: Working ITSM tool, first 2–3 paying customers (pilot)

---

## Phase 2: Developer Lifecycle (Tháng 4–6)

**Goal**: Automate onboarding/offboarding, asset tracking, leave sync — differentiate từ GitHub Issues và Freshservice.

### Month 4 — Onboarding & Offboarding
- [ ] Workflow template engine: trigger → steps → actions
- [ ] Onboarding workflow template: IT tasks + HR tasks + Manager tasks
- [ ] Offboarding workflow template: asset return + access revoke
- [ ] AMIS HRM webhook integration: employee.created/terminated events
- [ ] BambooHR API integration
- [ ] Workflow execution tracker: progress view for HR/Manager

### Month 5 — Asset Management
- [ ] Asset CMDB: types, catalog, CRUD
- [ ] Asset assignment: check-in/check-out, history
- [ ] Warranty expiry alerts
- [ ] Asset linked to onboarding/offboarding tickets
- [ ] Asset dashboard: inventory overview, location view
- [ ] Asset request via service catalog

### Month 6 — Leave Sync & Multi-tenant
- [ ] Leave calendar ingestion from HR webhooks
- [ ] Leave ↔ GitHub Issues availability sync (warn assignment during leave)
- [ ] Manager availability dashboard
- [ ] Multi-tenant admin: manage multiple orgs (for resellers/MSPs)
- [ ] Per-tenant custom branding (logo, colors)
- [ ] Usage analytics dashboard (for admin)

**Phase 2 Deliverable**: Full developer lifecycle automation, 10+ paying customers

---

## Phase 3: Intelligence & Scale (Tháng 7–12)

**Goal**: AI features, advanced reporting, mobile app — position để compete với Freshservice ở mid-market.

### Month 7–8 — AI & Advanced Reporting
- [ ] AI ticket categorization (Claude/OpenAI API)
- [ ] AI suggested responses for agents
- [ ] Custom report builder: drag-and-drop
- [ ] Scheduled report delivery to client email
- [ ] Multi-client SLA dashboard
- [ ] Client-facing portal (read-only SLA view for end clients)

### Month 9–10 — Custom Workflow Builder
- [ ] Visual workflow designer (React Flow)
- [ ] Trigger types: webhook, schedule, ticket event, HR event
- [ ] Action types: create ticket, notify, call API, create GitHub issue
- [ ] Workflow versioning and rollback
- [ ] Workflow marketplace: share templates between orgs

### Month 11–12 — Mobile & Platform
- [ ] React Native app: iOS + Android
- [ ] Push notifications: SLA alerts, approvals
- [ ] Ticket submit from mobile
- [ ] Approve requests from mobile
- [ ] Microsoft Teams integration
- [ ] API marketplace: public API for customer integrations
- [ ] Self-hosted deployment option (Docker Compose)
- [ ] SOC 2 Type I compliance roadmap

**Phase 3 Deliverable**: Full-featured platform, 50+ customers, $300K ARR

---

## Feature Prioritization Matrix

| Feature | Customer Value | Dev Effort | Priority |
|---------|---------------|------------|----------|
| Ticket CRUD + SLA | Very High | Medium | P0 |
| Self-service portal | Very High | Medium | P0 |
| Email notifications | High | Low | P0 |
| GitHub Issues integration | High | Medium | P0 |
| Slack integration | Medium | Low | P1 |
| SLA reports | High | Medium | P1 |
| Onboarding workflow | Very High | High | P1 |
| Asset management | High | Medium | P1 |
| AMIS HRM integration | High (VN-specific) | Medium | P1 |
| Leave sync | Medium | Medium | P2 |
| AI categorization | Medium | Medium | P2 |
| Custom workflow builder | High | Very High | P2 |
| Mobile app | Medium | High | P2 |
| Multi-client dashboard | High (CTO) | Medium | P2 |

---

## Dependencies & Risks

### Technical Dependencies
- GitHub App approval & OAuth setup (1–2 tuần)
- AMIS HRM API documentation (cần liên hệ vendor)
- Email delivery reliability (SendGrid/Mailgun setup)

### Business Risks
- **GitHub Issues expansion**: GitHub có thể mở rộng Issues/Projects vào ITSM space
  - Mitigation: Build deeper VN integration faster, price advantage
- **Customer slow adoption**: IT Manager VN conservative về tools mới
  - Mitigation: Free 3-month pilot, guided onboarding
- **Data residency**: Một số công ty muốn data nội địa
  - Mitigation: Self-hosted option trong Phase 3

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | April 2026 | Initial roadmap |
