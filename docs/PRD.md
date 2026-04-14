# Product Requirements Document (PRD) — VietOps

**Version**: 1.0  
**Date**: April 2026  
**Status**: Approved for MVP Development

---

## 1. Problem Statement

Các công ty IT outsourcing Việt Nam (200–1000+ developer) đang vận hành với hệ sinh thái công cụ rời rạc:
- IT requests qua email/Jira ticket trộn lẫn với dự án
- Onboarding developer mới tốn 2+ tuần, không có workflow chuẩn
- Asset (laptop, thiết bị) quản lý bằng Excel, thường xuyên mất track
- Leave/nghỉ phép không sync với Jira → manager không biết developer không available
- Không có SLA tracking → mất điểm với client Nhật/Úc/EU

**ServiceNow giải quyết được vấn đề này nhưng:** $50–150/user/tháng = $600K–1.8M/năm cho 1000 dev — **không phù hợp thị trường VN**.

---

## 2. Proposed Solution

VietOps là enterprise IT Service Management platform, được thiết kế riêng cho công ty outsource Việt Nam:
- **Giá**: $8–25/user/tháng (4–6x rẻ hơn ServiceNow)
- **Tích hợp native**: Jira, AMIS HRM, BambooHR, Google Workspace, Slack
- **Tiếng Việt + local support**
- **Deploy trong 1–2 tuần** (vs ServiceNow 6+ tháng)

---

## 3. Goals & Success Metrics

### Business Goals
- G1: 10 paying customers trong 12 tháng đầu (>$30K ARR)
- G2: NPS > 50 sau 6 tháng sử dụng
- G3: Churn < 5%/năm

### Product Goals
- G4: Time-to-first-value < 48h từ signup
- G5: >30% requests được resolve qua self-service
- G6: SLA breach rate < 5% cho khách hàng cấu hình đúng
- G7: Onboarding automation rate > 80% tasks

---

## 4. User Personas

### Persona 1: IT Manager — Nguyễn Văn An
- **Role**: IT Manager tại công ty outsource 300 dev
- **Goals**: Quản lý IT team 5–10 người, đảm bảo 300 dev được hỗ trợ IT kịp thời, báo cáo SLA cho ban giám đốc
- **Pain points**: Mất 2h/ngày tổng hợp báo cáo thủ công, liên tục bị ping qua Slack vì ticket bị bỏ sót
- **Tech savvy**: Cao — đã dùng Jira, biết ServiceNow nhưng không có budget

### Persona 2: Developer/Nhân Viên — Trần Thị Bình
- **Role**: Senior Developer, 3 năm kinh nghiệm
- **Goals**: Submit IT request nhanh, biết trạng thái request của mình, nhận laptop mới trong ngày đầu đi làm
- **Pain points**: Gửi email IT dept rồi không biết status, phải hỏi lại nhiều lần
- **Tech savvy**: Trung bình–Cao

### Persona 3: HR Manager — Lê Minh Châu
- **Role**: HR Manager quản lý 300+ nhân sự
- **Goals**: Onboarding developer mới suôn sẻ, tự động hóa checklist, không bị IT "quên" cấp access
- **Pain points**: Email qua lại với IT khi có nhân viên mới/nghỉ việc, không có single view cho toàn bộ onboarding status
- **Tech savvy**: Trung bình — dùng AMIS HRM hàng ngày

### Persona 4: CTO/COO — Phạm Đức Thắng
- **Role**: CTO của công ty outsource 500 dev
- **Goals**: Đảm bảo operation smooth, client Nhật hài lòng về SLA, chi phí vận hành tối ưu
- **Pain points**: Không có visibility tổng thể, biết vấn đề khi client phàn nàn
- **Tech savvy**: Cao — muốn data-driven decisions

### Persona 5: System Admin — Hoàng Văn Dũng
- **Role**: Sysadmin, quản lý account, VPN, thiết bị
- **Goals**: Provision/deprovision account nhanh chóng, track asset chính xác
- **Pain points**: Phải xử lý email request thủ công, thường xuyên cấp/thu hồi access sai do thông tin không đầy đủ

---

## 5. User Stories — Phase 1: Core ITSM

### Epic 1: Ticket Management

**ST-001** — Multi-channel Ticket Intake
> As a **developer**, I want to submit an IT request via web portal or email so that I don't have to search for the right person to contact.
- Acceptance: Ticket created từ web form, email, REST API
- Ticket nhận confirmation email với ticket number
- Ticket hiển thị trong agent queue ngay lập tức

**ST-002** — Auto-assignment & Routing
> As an **IT Manager**, I want tickets to be automatically assigned to the right team/person based on category so that no ticket falls through the cracks.
- Acceptance: Category rules config (Hardware → IT Helpdesk, Network → Sysadmin...)
- Auto-assign theo round-robin hoặc skill matching
- Unassigned tickets alert sau 30 phút

**ST-003** — SLA Tracking & Escalation
> As an **IT Manager**, I want SLA timers to start automatically and escalate before breach so that we never miss a client commitment.
- Acceptance: SLA policy gắn vào ticket tự động dựa theo priority/category
- Timer hiển thị realtime trên agent dashboard
- Email/Slack alert tại 50%, 75%, 100% SLA time
- SLA compliance report hàng tuần

**ST-004** — Self-Service Portal
> As a **developer**, I want a self-service catalog to request common IT services (password reset, new laptop, software install) without needing to contact the IT team.
- Acceptance: Catalog với minimum 10 pre-built service items
- Dynamic form questions per item type
- Estimated fulfillment time displayed
- Request status tracking trong portal

**ST-005** — Agent Dashboard
> As an **IT agent**, I want a real-time dashboard showing my queue, SLA status, and today's priorities so that I can manage my workload effectively.
- Acceptance: My queue view với SLA countdown
- Filter by status, priority, category
- One-click ticket update (resolve, reassign, add note)

### Epic 2: Notifications

**ST-006** — Email Notifications
> As a **ticket submitter**, I want to receive email updates when my ticket status changes so that I'm always informed.
- Acceptance: Email khi ticket: created, assigned, updated, resolved, closed
- HTML email templates với branding
- Unsubscribe option

**ST-007** — Slack Notifications
> As an **IT agent**, I want SLA breach warnings in Slack so that I can react immediately.
- Acceptance: Slack message cho: new high-priority ticket, SLA warnings, ticket assigned to me
- Slack message có link direct đến ticket
- Config per-channel per notification type

### Epic 3: Reports & Dashboard

**ST-008** — Management SLA Report
> As a **CTO/IT Manager**, I want a weekly SLA compliance report so that I can share it with clients and leadership.
- Acceptance: SLA compliance % by category, by team, by priority
- MTTR (Mean Time To Resolution) metrics
- Ticket volume trends (week-over-week)
- Export to PDF/CSV

### Epic 4: Jira Integration

**ST-009** — Jira Ticket Linking
> As an **IT agent**, I want to link a VietOps ticket to a Jira issue so that developers and project managers have unified visibility.
- Acceptance: Search và link Jira issue từ ticket detail
- Jira issue status hiển thị trong VietOps ticket
- Comment sync (optional) giữa 2 hệ thống

**ST-010** — Jira Auto-create
> As an **IT Manager**, I want certain ticket types (e.g., infrastructure issues) to automatically create Jira issues so that dev team is notified without manual steps.
- Acceptance: Config rule: ticket category + priority → auto-create Jira issue in specified project
- Jira issue created với proper labels, description

### Epic 5: Auth & Multi-tenant

**ST-011** — Organization Management
> As an **IT Manager**, I want to create my company's organization, invite team members, and set roles so that access is controlled.
- Acceptance: Org creation flow
- Invite via email
- Roles: Admin, Manager, Agent, User (requester)
- Per-org data isolation

---

## 6. User Stories — Phase 2: Developer Lifecycle

**ST-012** — Onboarding Workflow
> As an **HR Manager**, I want to trigger an automated onboarding workflow when a new developer joins so that IT preparation happens without manual emails.
- Acceptance: Webhook từ AMIS HRM tạo onboarding checklist tự động
- Checklist: laptop request, account creation (email/Jira/Slack/VPN), mentor assignment
- Progress tracking cho HR + IT + Manager
- All tasks phải complete trước start date (SLA)

**ST-013** — Offboarding Workflow
> As an **HR Manager**, I want an automated offboarding workflow to ensure all access is revoked when a developer leaves.
- Acceptance: Trigger khi employee status = departing
- Auto-create tasks: laptop return, disable email, disable Jira, revoke VPN
- Completion confirmation required cho mỗi task
- Audit log cho compliance

**ST-014** — Asset Management
> As a **Sysadmin**, I want to track all IT assets (laptops, monitors, phones) and their assignment to employees so that I always know what's where.
- Acceptance: Asset catalog (type, brand, model, serial, purchase date, warranty)
- Assignment history (employee ↔ asset)
- Check-in/check-out workflow
- Warranty expiry email alerts

**ST-015** — Leave ↔ Jira Sync
> As a **Project Manager**, I want to see developer availability in Jira based on approved leave so that I don't assign work to people who are on leave.
- Acceptance: Approved leave triggers availability update
- Jira sprint capacity dashboard shows actual available days
- Alert khi assigning ticket to developer on leave

---

## 7. User Stories — Phase 3: Intelligence & Scale

**ST-016** — AI Ticket Categorization
> As an **IT Manager**, I want incoming tickets to be automatically categorized using AI so that manual categorization time is eliminated.
- Acceptance: AI suggests category + priority với confidence score
- Agent can accept or override
- Override feedback feeds back into model training

**ST-017** — Custom Workflow Builder
> As an **IT Manager**, I want to build custom workflows (e.g., software approval process) using a no-code interface so that I can automate any process without developer help.
- Acceptance: Visual drag-and-drop workflow designer
- Trigger types: ticket created, status changed, schedule, webhook
- Action types: assign task, send notification, create ticket, call webhook
- Save, version, and deploy workflows

**ST-018** — Multi-client SLA Dashboard
> As a **CTO** of an outsourcing company, I want a single dashboard showing SLA performance across all clients so that I can identify at-risk accounts.
- Acceptance: All-clients overview với SLA health indicator
- Drill-down per client
- Client-specific SLA thresholds
- Scheduled report delivery to client email

**ST-019** — Mobile App
> As a **developer or manager**, I want to submit and approve requests from my phone so that I'm not blocked when away from desk.
- Acceptance: iOS + Android via React Native
- Submit ticket, check status
- Approve pending requests
- Push notification cho SLA alerts

---

## 8. Non-Functional Requirements

### Performance
- API response time p95 < 200ms (ticket CRUD)
- Dashboard load < 2s
- Support 10,000 tickets/day per tenant
- 99.5% uptime (Phase 1), 99.9% (Phase 2+)

### Security
- Data isolation per tenant (row-level security)
- Mã hóa data at rest và in transit (AES-256, TLS 1.3)
- Audit log cho mọi action
- OWASP Top 10 compliance
- 2FA support

### Scalability
- Horizontal scaling cho backend services
- Database connection pooling
- Queue-based async processing cho SLA timers
- CDN cho static assets

### Localization
- Tiếng Việt mặc định, có thể switch sang English
- Múi giờ: UTC+7 default, configurable
- Date format: DD/MM/YYYY (VN standard)
- Currency: VND + USD

---

## 9. Out of Scope (Phase 1)

- Mobile native app (Phase 3)
- AI features (Phase 3)
- Custom workflow builder (Phase 3)
- ITOM (infrastructure monitoring)
- Advanced CMDB with auto-discovery
- Financial/billing module
- Customer-facing portal (B2C)
