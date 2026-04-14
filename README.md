# VietOps — Enterprise IT Service Management Platform

> ServiceNow-like platform designed for Vietnamese IT outsourcing companies — affordable, fast to deploy, and deeply integrated with the tools your team already uses.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Phase](https://img.shields.io/badge/Phase-1%20(MVP)-blue.svg)]()
[![Target](https://img.shields.io/badge/Market-Vietnam%20IT%20Outsourcing-green.svg)]()

---

## Tại sao VietOps?

| Vấn đề | ServiceNow | Freshservice | **VietOps** |
|--------|-----------|-------------|-------------|
| Giá | $50–150/user/mo | $19–99/user/mo | **$8–25/user/mo** |
| Thời gian deploy | 6+ tháng | 2–4 tuần | **1–2 tuần** |
| Tiếng Việt | ❌ | ❌ | ✅ |
| Tích hợp Jira | Phức tạp | Cơ bản | **Native, sâu** |
| Tích hợp HR VN (AMIS, Fast) | ❌ | ❌ | ✅ |
| SLA multi-client | ✅ | Giới hạn | ✅ |
| Support nội địa | ❌ | ❌ | ✅ |

**Mục tiêu:** Thay thế hàng chục tool rời rạc (Excel + email + Jira trộn lẫn) bằng 1 platform duy nhất, giá phù hợp với thị trường Việt Nam.

---

## Target Khách Hàng

- **Công ty outsource 200–500 dev** (Rikkeisoft, Axon Active, Savvycom, KMS Technology...)
- Đang quản lý IT bằng Excel + email thủ công
- Cần SLA tracking minh bạch cho client Nhật/Úc/EU
- Muốn tự động hóa onboarding/offboarding developer

---

## Core Modules

### Phase 1 — Core ITSM (Tháng 1–3)
- **Ticket Management**: Multi-channel intake, auto-assignment, priority matrix
- **SLA Engine**: Policy config, timer tracking, breach escalation
- **Self-Service Portal**: Service catalog, request tracking
- **Notification System**: Email + Slack
- **Dashboard & Reports**: Real-time KPI, SLA compliance reports
- **Jira Integration**: Bi-directional sync

### Phase 2 — Developer Lifecycle (Tháng 4–6)
- **Onboarding/Offboarding Workflows**: Auto-triggered, checklist-based
- **Asset Management (CMDB Lite)**: Thiết bị, check-in/out, warranty alerts
- **HR Integration**: AMIS HRM, BambooHR webhooks
- **Leave ↔ Availability Sync**: Real-time Jira capacity update
- **Multi-tenant**: Quản lý nhiều công ty trên 1 platform

### Phase 3 — Intelligence & Scale (Tháng 7–12)
- **Multi-client SLA Dashboard**: All-clients overview + drill-down
- **AI Ticket Categorization**: Claude/OpenAI API integration
- **Custom Workflow Builder**: No-code drag-and-drop
- **Advanced Reporting**: Custom reports, scheduled delivery, PDF/Excel export
- **Mobile App**: React Native, push notifications, approval actions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Node.js (Fastify) hoặc Go |
| **Database** | PostgreSQL (main), Redis (queue/cache/SLA timers) |
| **Search** | Elasticsearch (Phase 2+) |
| **Queue** | BullMQ (Redis-backed) |
| **Auth** | JWT + Google SSO |
| **Infra** | Docker, Railway/Render (MVP), AWS/GCP (scale) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│  Self-Service Portal │ Agent Dashboard │ Admin Panel │
└──────────────────────────┬──────────────────────────┘
                           │ REST API / WebSocket
┌──────────────────────────▼──────────────────────────┐
│                  Backend (Fastify/Go)                │
│  Auth │ Ticket Engine │ SLA Engine │ Workflow Engine │
│  Notification Service │ Integration Hub              │
└──────────────────────────┬──────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     PostgreSQL          Redis         BullMQ Workers
    (main data)     (cache/timers)   (async jobs)
                                          │
                              ┌───────────┴──────────┐
                              ▼                      ▼
                        Jira API            Email/Slack/Teams
                      AMIS HRM API          HR Webhooks
```

---

## Bắt Đầu Nhanh (Development)

```bash
# Clone repo
git clone https://github.com/phanngoc/vietops.git
cd vietops

# Setup environment
cp .env.example .env
# Điền các biến môi trường cần thiết

# Start services
docker-compose up -d

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Start dev server
npm run dev
```

---

## Tài Liệu

| Tài liệu | Mô tả |
|---------|-------|
| [PRD](docs/PRD.md) | Product Requirements Document |
| [Architecture](docs/ARCHITECTURE.md) | Kiến trúc hệ thống chi tiết |
| [Database Schema](docs/DATABASE_SCHEMA.md) | Schema cơ sở dữ liệu |
| [API Design](docs/API_DESIGN.md) | REST API specification |
| [Roadmap](docs/ROADMAP.md) | Roadmap chi tiết theo phase |
| [Business Model](docs/BUSINESS_MODEL.md) | Mô hình kinh doanh & GTM |

---

## Đóng Góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md) để biết cách đóng góp vào dự án.

---

## License

MIT © 2026 VietOps Team
