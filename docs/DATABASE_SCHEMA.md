# Database Schema — VietOps

PostgreSQL 16 với Prisma ORM. Multi-tenant via `organization_id` on every table.

---

## Core Tables

### organizations
```sql
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,  -- subdomain: acme.vietops.io
  plan            VARCHAR(50) DEFAULT 'starter', -- starter | growth | enterprise
  settings        JSONB DEFAULT '{}',            -- org-level config
  logo_url        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### users
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  password_hash   TEXT,                          -- null nếu dùng SSO
  role            VARCHAR(50) NOT NULL,          -- admin | manager | agent | user
  department      VARCHAR(100),
  employee_code   VARCHAR(50),                   -- từ HR system
  avatar_url      TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
```

---

## Ticket Management

### ticket_categories
```sql
CREATE TABLE ticket_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,          -- "Hardware", "Software", "Network"
  name_vi         VARCHAR(100),                   -- "Phần cứng", "Phần mềm"
  parent_id       UUID REFERENCES ticket_categories(id),
  icon            VARCHAR(50),
  default_assignee_id UUID REFERENCES users(id),
  default_team_id     UUID,                       -- FK to teams (future)
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE
);
```

### sla_policies
```sql
CREATE TABLE sla_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,
  priority        VARCHAR(20) NOT NULL,            -- critical | high | medium | low
  response_hours  INT NOT NULL,                   -- thời gian acknowledge
  resolution_hours INT NOT NULL,                  -- thời gian resolve
  business_hours_only BOOLEAN DEFAULT TRUE,       -- tính theo giờ làm việc hay 24/7
  escalation_to_id UUID REFERENCES users(id),     -- escalate to whom
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### tickets
```sql
CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  ticket_number   VARCHAR(20) NOT NULL,            -- TKT-2026-00001
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  status          VARCHAR(30) DEFAULT 'open',
  -- open | in_progress | pending_customer | pending_third_party | resolved | closed
  priority        VARCHAR(20) DEFAULT 'medium',    -- critical | high | medium | low
  category_id     UUID REFERENCES ticket_categories(id),
  source          VARCHAR(30) DEFAULT 'portal',   -- portal | email | api | slack
  requester_id    UUID NOT NULL REFERENCES users(id),
  assignee_id     UUID REFERENCES users(id),
  due_date        TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  tags            TEXT[],
  metadata        JSONB DEFAULT '{}',             -- extra data (email headers, etc.)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_org ON tickets(organization_id);
CREATE INDEX idx_tickets_status ON tickets(organization_id, status);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX idx_tickets_number ON tickets(organization_id, ticket_number);
```

### ticket_sla_records
```sql
CREATE TABLE ticket_sla_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id),
  sla_policy_id   UUID REFERENCES sla_policies(id),
  sla_type        VARCHAR(20) NOT NULL,            -- response | resolution
  target_time     TIMESTAMPTZ NOT NULL,
  actual_time     TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'active',   -- active | paused | breached | met
  breached_at     TIMESTAMPTZ,
  pause_duration  INT DEFAULT 0,                  -- phút dừng (awaiting customer)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_ticket ON ticket_sla_records(ticket_id);
CREATE INDEX idx_sla_status ON ticket_sla_records(status, target_time);
```

### ticket_comments
```sql
CREATE TABLE ticket_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id),
  author_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  is_internal     BOOLEAN DEFAULT FALSE,          -- internal note vs public reply
  attachments     JSONB DEFAULT '[]',             -- [{name, url, size, mime_type}]
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### ticket_activities
```sql
CREATE TABLE ticket_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id),
  actor_id        UUID REFERENCES users(id),
  action          VARCHAR(50) NOT NULL,           -- created | status_changed | assigned | etc.
  old_value       TEXT,
  new_value       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Service Catalog

### catalog_items
```sql
CREATE TABLE catalog_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  name_vi         VARCHAR(255),
  description     TEXT,
  category_id     UUID REFERENCES ticket_categories(id),
  icon            VARCHAR(50),
  estimated_hours INT,                            -- SLA reference
  form_schema     JSONB DEFAULT '{}',             -- dynamic form definition
  default_assignee_id UUID REFERENCES users(id),
  approval_required   BOOLEAN DEFAULT FALSE,
  approver_id     UUID REFERENCES users(id),
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0
);
```

---

## Notifications

### notification_templates
```sql
CREATE TABLE notification_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id), -- null = system template
  name            VARCHAR(100) NOT NULL,
  event_type      VARCHAR(100) NOT NULL,          -- ticket.created | sla.breach | etc.
  channel         VARCHAR(20) NOT NULL,           -- email | slack | in_app
  subject         VARCHAR(255),
  body_template   TEXT NOT NULL,                  -- Handlebars template
  is_active       BOOLEAN DEFAULT TRUE
);
```

### notifications
```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recipient_id    UUID NOT NULL REFERENCES users(id),
  ticket_id       UUID REFERENCES tickets(id),
  title           VARCHAR(255),
  body            TEXT,
  channel         VARCHAR(20),
  status          VARCHAR(20) DEFAULT 'pending', -- pending | sent | failed | read
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Integrations

### integrations
```sql
CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  type            VARCHAR(50) NOT NULL,           -- github | slack | amis_hrm | bamboohr | teams
  name            VARCHAR(100),
  config          JSONB NOT NULL,                 -- encrypted credentials, URLs
  is_active       BOOLEAN DEFAULT TRUE,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### github_issue_links
```sql
CREATE TABLE github_issue_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES tickets(id),
  integration_id      UUID NOT NULL REFERENCES integrations(id),
  github_repo         VARCHAR(255) NOT NULL,        -- e.g. "org/repo"
  github_issue_number INT NOT NULL,                 -- e.g. 123
  github_issue_url    TEXT,
  sync_status         VARCHAR(20) DEFAULT 'active',
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Asset Management (Phase 2)

### asset_types
```sql
CREATE TABLE asset_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,          -- "Laptop", "Monitor", "Phone"
  name_vi         VARCHAR(100),
  icon            VARCHAR(50),
  fields_schema   JSONB DEFAULT '{}'              -- custom fields per type
);
```

### assets
```sql
CREATE TABLE assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  asset_type_id   UUID NOT NULL REFERENCES asset_types(id),
  asset_tag       VARCHAR(50),                    -- internal barcode/label
  serial_number   VARCHAR(100),
  brand           VARCHAR(100),
  model           VARCHAR(100),
  status          VARCHAR(30) DEFAULT 'available',
  -- available | assigned | in_repair | retired | lost
  assigned_to_id  UUID REFERENCES users(id),
  assigned_at     TIMESTAMPTZ,
  purchase_date   DATE,
  purchase_cost   DECIMAL(12,2),
  warranty_expiry DATE,
  location        VARCHAR(100),                  -- "HCM Office", "HN Office"
  notes           TEXT,
  custom_fields   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_org ON assets(organization_id);
CREATE INDEX idx_assets_assigned ON assets(assigned_to_id);
```

### asset_movements
```sql
CREATE TABLE asset_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES assets(id),
  from_user_id    UUID REFERENCES users(id),
  to_user_id      UUID REFERENCES users(id),
  action          VARCHAR(30) NOT NULL,           -- assigned | returned | repaired | retired
  ticket_id       UUID REFERENCES tickets(id),   -- linked to onboarding ticket
  notes           TEXT,
  created_by_id   UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Workflow Engine (Phase 2)

### workflow_templates
```sql
CREATE TABLE workflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,           -- onboarding | offboarding | custom
  trigger_config  JSONB NOT NULL,                 -- trigger definition
  steps           JSONB NOT NULL,                 -- ordered array of actions
  is_active       BOOLEAN DEFAULT TRUE,
  version         INT DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### workflow_executions
```sql
CREATE TABLE workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id UUID REFERENCES workflow_templates(id),
  organization_id UUID NOT NULL,
  trigger_data    JSONB,                          -- data that triggered the workflow
  status          VARCHAR(30) DEFAULT 'running', -- running | completed | failed | cancelled
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
```

### workflow_tasks
```sql
CREATE TABLE workflow_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL REFERENCES workflow_executions(id),
  step_index      INT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  assignee_id     UUID REFERENCES users(id),
  status          VARCHAR(30) DEFAULT 'pending', -- pending | in_progress | done | skipped
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  completed_by_id UUID REFERENCES users(id),
  notes           TEXT
);
```

---

## HR & Availability (Phase 2)

### employees (mirror từ HR system)
```sql
CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID REFERENCES users(id),     -- linked VietOps user nếu có
  external_id     VARCHAR(100),                  -- ID từ AMIS/BambooHR
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  department      VARCHAR(100),
  position        VARCHAR(100),
  manager_id      UUID REFERENCES employees(id),
  start_date      DATE,
  end_date        DATE,
  status          VARCHAR(30) DEFAULT 'active',  -- active | on_leave | terminated
  source          VARCHAR(30),                   -- amis_hrm | bamboohr | manual
  raw_data        JSONB,                         -- original payload từ HR system
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### leave_records
```sql
CREATE TABLE leave_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  employee_id     UUID NOT NULL REFERENCES employees(id),
  leave_type      VARCHAR(50),                   -- annual | sick | unpaid | etc.
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          VARCHAR(20) DEFAULT 'approved', -- pending | approved | rejected
  external_id     VARCHAR(100),                  -- ID từ HR system
  synced_to_github BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Enums Reference

```
ticket.status:
  open → in_progress → pending_customer | pending_third_party → resolved → closed

ticket.priority:
  critical (SLA: 1h response / 4h resolution)
  high     (SLA: 2h response / 8h resolution)
  medium   (SLA: 4h response / 24h resolution)
  low      (SLA: 8h response / 72h resolution)

user.role:
  admin    → full access, org settings
  manager  → view all tickets, reports, approve
  agent    → handle tickets, update, comment
  user     → submit tickets, view own tickets
```
