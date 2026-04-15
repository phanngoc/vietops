# API Design — VietOps REST API

**Base URL**: `https://api.vietops.io/v1`  
**Auth**: Bearer JWT token trong `Authorization` header  
**Format**: JSON  
**Versioning**: URL path (`/v1`)

---

## Authentication

### POST /auth/login
```json
Request:
{ "email": "user@company.com", "password": "..." }

Response 200:
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 900,
  "user": { "id": "...", "email": "...", "role": "agent", "organization": {...} }
}
```

### POST /auth/refresh
```json
Request: { "refresh_token": "..." }
Response 200: { "access_token": "...", "expires_in": 900 }
```

### POST /auth/google
```json
Request: { "id_token": "google_id_token" }
Response 200: same as /auth/login
```

---

## Tickets

### GET /tickets
Query params: `status`, `priority`, `category_id`, `assignee_id`, `page`, `limit`, `sort`, `search`

```json
Response 200:
{
  "data": [
    {
      "id": "uuid",
      "ticket_number": "TKT-2026-00042",
      "title": "Laptop không kết nối được WiFi",
      "status": "open",
      "priority": "high",
      "category": { "id": "...", "name": "Hardware" },
      "requester": { "id": "...", "full_name": "Trần Văn B", "avatar_url": "..." },
      "assignee": null,
      "sla": {
        "response": { "target": "2026-04-14T10:00:00Z", "status": "active", "percent": 45 },
        "resolution": { "target": "2026-04-14T18:00:00Z", "status": "active", "percent": 20 }
      },
      "created_at": "2026-04-14T08:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 142, "pages": 8 }
}
```

### POST /tickets
```json
Request:
{
  "title": "Cần cài đặt VS Code",
  "description": "...",
  "category_id": "uuid",
  "priority": "medium",
  "source": "portal"
}

Response 201:
{
  "id": "uuid",
  "ticket_number": "TKT-2026-00043",
  ...
}
```

### GET /tickets/:id
Full ticket detail với comments, activity log, SLA records, GitHub issue links.

### PATCH /tickets/:id
```json
Request (partial update):
{
  "status": "in_progress",
  "assignee_id": "uuid",
  "priority": "critical"
}
```

### POST /tickets/:id/comments
```json
Request:
{
  "body": "Đã nhận ticket, đang kiểm tra...",
  "is_internal": false,
  "attachments": []
}
```

### POST /tickets/:id/github-links
```json
Request: { "github_issue_number": 123, "github_repo": "org/repo" }
Response 201: { "id": "...", "github_issue_number": 123, "github_issue_url": "https://github.com/org/repo/issues/123" }
```

---

## Service Catalog

### GET /catalog
```json
Response 200:
{
  "categories": [
    {
      "id": "uuid",
      "name": "IT Equipment",
      "name_vi": "Thiết bị IT",
      "items": [
        {
          "id": "uuid",
          "name": "Request New Laptop",
          "name_vi": "Yêu cầu laptop mới",
          "estimated_hours": 24,
          "approval_required": true
        }
      ]
    }
  ]
}
```

### POST /catalog/:id/submit
```json
Request: { "form_data": { "laptop_type": "MacBook Pro", "reason": "..." } }
Response 201: { "ticket_id": "uuid", "ticket_number": "TKT-2026-00044" }
```

---

## SLA

### GET /sla-policies
List SLA policies cho org.

### POST /sla-policies
```json
Request:
{
  "name": "Standard SLA",
  "priority": "high",
  "response_hours": 2,
  "resolution_hours": 8,
  "business_hours_only": true
}
```

### GET /tickets/:id/sla
```json
Response:
{
  "response_sla": {
    "target": "2026-04-14T10:00:00Z",
    "status": "met",
    "actual_time": "2026-04-14T09:30:00Z"
  },
  "resolution_sla": {
    "target": "2026-04-14T18:00:00Z",
    "status": "active",
    "percent_elapsed": 35,
    "time_remaining_minutes": 312
  }
}
```

---

## Reports

### GET /reports/sla-compliance
Query: `from`, `to`, `group_by` (category|priority|team)

```json
Response:
{
  "period": { "from": "2026-04-01", "to": "2026-04-30" },
  "summary": {
    "total_tickets": 342,
    "response_sla_met_pct": 94.2,
    "resolution_sla_met_pct": 87.6,
    "avg_mttr_hours": 6.4
  },
  "breakdown": [
    { "group": "Hardware", "total": 89, "response_met_pct": 96.6, "resolution_met_pct": 91.0 }
  ]
}
```

### GET /reports/ticket-volume
```json
Response: { "daily": [...], "by_category": [...], "by_status": [...] }
```

---

## Integrations

### GET /integrations
List active integrations cho org.

### POST /integrations/github/connect
```json
Request: { "installation_id": "...", "oauth_code": "..." }
Response 201: { "id": "uuid", "type": "github", "name": "Our GitHub", "is_active": true }
```

### POST /integrations/slack/connect
```json
Request: { "webhook_url": "https://hooks.slack.com/..." }
```

### POST /webhooks/amis — Inbound từ AMIS HRM
```json
Request (AMIS sends this):
{
  "event": "employee.created",
  "employee": {
    "external_id": "EMP-001",
    "full_name": "Nguyễn Văn A",
    "email": "nva@company.com",
    "department": "Engineering",
    "start_date": "2026-05-01"
  }
}
```

---

## Assets (Phase 2)

### GET /assets
Query: `status`, `type_id`, `assigned_to_id`, `location`

### POST /assets
```json
Request:
{
  "asset_type_id": "uuid",
  "brand": "Apple",
  "model": "MacBook Pro M4",
  "serial_number": "C02AB1234",
  "purchase_date": "2026-01-15",
  "warranty_expiry": "2029-01-15",
  "location": "HCM Office"
}
```

### POST /assets/:id/assign
```json
Request: { "user_id": "uuid", "ticket_id": "uuid" }
```

### POST /assets/:id/return
```json
Request: { "notes": "Laptop bị trầy nhỏ ở góc" }
```

---

## Error Responses

```json
400 Bad Request:
{ "error": "VALIDATION_ERROR", "message": "Title is required", "details": [...] }

401 Unauthorized:
{ "error": "UNAUTHORIZED", "message": "Token expired" }

403 Forbidden:
{ "error": "FORBIDDEN", "message": "Insufficient permissions" }

404 Not Found:
{ "error": "NOT_FOUND", "message": "Ticket not found" }

429 Too Many Requests:
{ "error": "RATE_LIMITED", "message": "Rate limit exceeded", "retry_after": 60 }

500 Internal Server Error:
{ "error": "INTERNAL_ERROR", "message": "Something went wrong", "request_id": "..." }
```

---

## WebSocket Events (Real-time)

```
Connection: wss://api.vietops.io/v1/ws?token=<jwt>

Events (server → client):
  ticket.created          { ticket_id, ticket_number, title }
  ticket.updated          { ticket_id, changes: { status, assignee, ... } }
  ticket.sla_warning      { ticket_id, sla_type, percent_elapsed }
  ticket.sla_breached     { ticket_id, sla_type }
  notification.new        { notification_id, title, body }

Events (client → server):
  subscribe.ticket        { ticket_id } — realtime updates for specific ticket
  subscribe.queue         {} — realtime updates for agent queue
```
