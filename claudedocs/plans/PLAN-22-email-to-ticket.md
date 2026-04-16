# PLAN-22 — Email-to-Ticket Parser Service

**Issue**: #22  
**Branch**: `feature/22-email-to-ticket`  
**Date**: 2026-04-16  
**Retro lessons applied**: real-DB tests, injectable mailer for testability, no mocked DB

---

## Problem

Support engineers send emails to a shared inbox. Currently those never become tickets, so work is lost and SLAs can't be tracked.

## Solution

Inbound email webhook (`POST /webhooks/email/:orgId`) that accepts the **SendGrid Inbound Parse** format (multipart form-data). The handler:

1. Verifies the sender domain against the org's allowlist
2. Strips email signatures from the body
3. Creates a ticket via `TicketService.create()`
4. Sends an auto-reply with the ticket number via an abstract `Mailer` plugin

## Architecture

```
Provider (SendGrid/Mailgun)
  ↓ POST /webhooks/email/:orgId
EmailRoutes
  ↓ parse + validate (Zod)
EmailService.ingest(payload, orgId)
  ├─ spamCheck(from, org.settings.emailAllowedDomains)
  ├─ stripSignature(text)
  ├─ findOrCreateRequester(from, orgId)
  ├─ TicketService.create({ title: subject, description: body, source: 'email', ... })
  └─ mailer.sendAutoReply(from, ticketNumber)
```

## Data Flow

- Org domain allowlist stored in `Organization.settings.emailAllowedDomains: string[]`
- Email source recorded in `ticket.metadata.emailSource: { from, messageId, rawSubject }`
- Ticket `source` field set to `'email'`
- Requester: look up user by email in org; if not found, use first admin as `requesterId`
  (Phase 1 simplification — Phase 2 will create guest requester records)

## New Files

| File | Purpose |
|------|---------|
| `src/plugins/mailer.ts` | Abstract mailer — SMTP in prod, no-op in test |
| `src/modules/email/email.schema.ts` | Zod schema for SendGrid webhook payload |
| `src/modules/email/email.service.ts` | Parse, spam filter, signature strip, ticket create |
| `src/modules/email/email.routes.ts` | `POST /webhooks/email/:orgId` |
| `src/modules/email/email.test.ts` | Integration tests (real DB, no mocks) |

## Modified Files

| File | Change |
|------|--------|
| `src/config.ts` | Add `SMTP_URL?`, `EMAIL_WEBHOOK_SECRET?` |
| `src/app.ts` | Register mailer plugin + email routes |
| `prisma/schema.prisma` | No change (use existing `metadata` JSON + `source` field) |

## Test Plan (retro: real DB, injectable mailer)

1. Org with `emailAllowedDomains: ['example.com']`
2. `POST /webhooks/email/:orgId` from `user@example.com` → 201 + ticket in DB
3. Same from `spam@unknown.com` → 403
4. Missing `from` field → 400 validation error
5. `subject` becomes ticket title; `text` body (stripped) becomes description
6. Requester lookup: if email matches a user → set requesterId
7. Requester lookup: email unknown → fall back to first admin
8. Signature stripping unit test: `-- \\nSent from my iPhone` stripped
9. Auto-reply: mailer called with correct ticket number (spy on no-op mailer)

## Retro Improvements Baked In

- **Mailer injectable**: `fastify.mailer` decorated via plugin; test env uses a no-op with call tracking
- **No mocked DB**: all tests hit real `vietops_test` Postgres
- **fileParallelism: false** (already set in vitest.config.ts)
- **Type safety**: `Organization.settings` cast to typed interface, no `any`
