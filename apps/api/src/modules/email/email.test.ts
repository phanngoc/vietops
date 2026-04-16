import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../app.js'
import type { Env } from '../../config.js'
import { PrismaClient } from '@prisma/client'
import { stripSignature, parseEmailAddress, extractDomain } from './email.service.js'

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/vietops_test'

const testConfig: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  DATABASE_URL: TEST_DB_URL,
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-min-32-characters-long-enough',
  JWT_EXPIRES_IN: 900,
  REFRESH_TOKEN_EXPIRES_IN: 604800,
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:3001',
}

describe('Email-to-Ticket', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let orgId: string

  beforeAll(async () => {
    app = await buildApp(testConfig)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  beforeEach(async () => {
    // Clean — same order as other test files to respect FK constraints
    await prisma.refreshToken.deleteMany()
    await prisma.ticketActivity.deleteMany()
    await prisma.ticketComment.deleteMany()
    await prisma.ticketSlaRecord.deleteMany()
    await prisma.ticket.deleteMany()
    await prisma.catalogItem.deleteMany()
    await prisma.ticketCategory.deleteMany()
    await prisma.slaPolicy.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.notificationTemplate.deleteMany()
    await prisma.integration.deleteMany()
    await prisma.user.deleteMany()
    await prisma.organization.deleteMany()

    // Register org + admin
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        organizationName: 'Email Test Org',
        organizationSlug: 'email-test',
        email: 'admin@example.com',
        password: 'SecurePass123!',
        fullName: 'Email Admin',
      },
    })
    const body = reg.json()
    orgId = body.user.organization.id

    // Set allowed domains on the org
    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: { emailAllowedDomains: ['example.com'] } },
    })

    // Clear auto-reply tracking after bootstrap (register also sends no-op mailer calls)
    app.mailer._sent?.splice(0)
  })

  // ── Pure unit tests (no DB) ────────────────────────────────────────────────

  describe('stripSignature()', () => {
    it('strips "-- " RFC separator', () => {
      const input = 'Hello\n\nI need help.\n-- \nJohn Doe\njohn@example.com'
      expect(stripSignature(input)).toBe('Hello\n\nI need help.')
    })

    it('strips "Sent from my iPhone"', () => {
      const input = 'Quick question here.\nSent from my iPhone'
      expect(stripSignature(input)).toBe('Quick question here.')
    })

    it('strips common sign-off', () => {
      const input = 'Ticket issue\nBest regards,\nJane'
      expect(stripSignature(input)).toBe('Ticket issue')
    })

    it('strips Vietnamese sign-off', () => {
      const input = 'Lỗi đăng nhập\nTrân trọng,\nNguyễn Văn A'
      expect(stripSignature(input)).toBe('Lỗi đăng nhập')
    })

    it('returns full text when no signature present', () => {
      const input = 'Just a plain message.'
      expect(stripSignature(input)).toBe('Just a plain message.')
    })
  })

  describe('parseEmailAddress()', () => {
    it('extracts address from "Name <email>" format', () => {
      expect(parseEmailAddress('John Doe <john@example.com>')).toBe('john@example.com')
    })

    it('returns plain email as-is', () => {
      expect(parseEmailAddress('john@example.com')).toBe('john@example.com')
    })

    it('lowercases the address', () => {
      expect(parseEmailAddress('JOHN@EXAMPLE.COM')).toBe('john@example.com')
    })
  })

  describe('extractDomain()', () => {
    it('extracts domain from email', () => {
      expect(extractDomain('john@example.com')).toBe('example.com')
    })
  })

  // ── Webhook endpoint tests ─────────────────────────────────────────────────

  describe('POST /webhooks/email/:orgId', () => {
    it('creates a ticket from valid email (known domain)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'User One <user@example.com>',
          subject: 'Cannot login to portal',
          text: 'I cannot log in since this morning.\n-- \nUser One',
        },
      })

      expect(res.statusCode).toBe(201)
      const ticket = res.json()
      expect(ticket.title).toBe('Cannot login to portal')
      // Signature stripped from description
      expect(ticket.description).toBe('I cannot log in since this morning.')
      expect(ticket.source).toBe('email')
      expect(ticket.metadata).toMatchObject({
        emailSource: { from: 'User One <user@example.com>' },
      })

      // Verify ticket persisted in DB
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } })
      expect(dbTicket).not.toBeNull()
    })

    it('returns 403 when sender domain is not in allowlist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'spam@unknown.com',
          subject: 'Buy now!',
          text: 'Click here for great deals',
        },
      })
      expect(res.statusCode).toBe(403)
    })

    it('returns 404 for unknown orgId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/email/00000000-0000-0000-0000-000000000000',
        payload: {
          from: 'user@example.com',
          subject: 'Test',
          text: 'Body',
        },
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 400 when "from" field is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          subject: 'No sender',
          text: 'Body without from',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('defaults subject to "(no subject)" when omitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'user@example.com',
          text: 'Just a body',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().title).toBe('(no subject)')
    })

    it('sets requesterId to matching user when from email is known', async () => {
      // The admin registered with admin@example.com
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'admin@example.com',
          subject: 'Admin self-ticket',
          text: 'Testing self',
        },
      })
      expect(res.statusCode).toBe(201)
      const ticket = res.json()
      const admin = await prisma.user.findFirst({ where: { organizationId: orgId, role: 'admin' } })
      expect(ticket.requester.id).toBe(admin!.id)
    })

    it('falls back to first admin as requester when sender is unknown', async () => {
      // example.com is in allowlist; user does not exist in org
      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'newuser@example.com',
          subject: 'First contact',
          text: 'Hello',
        },
      })
      expect(res.statusCode).toBe(201)
      const ticket = res.json()
      const admin = await prisma.user.findFirst({ where: { organizationId: orgId, role: 'admin' } })
      expect(ticket.requester.id).toBe(admin!.id)
    })

    it('sends auto-reply via mailer', async () => {
      await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'user@example.com',
          subject: 'Need help',
          text: 'Please assist',
        },
      })

      const sent = app.mailer._sent ?? []
      expect(sent).toHaveLength(1)
      expect(sent[0]!.to).toBe('user@example.com')
      expect(sent[0]!.subject).toContain('Need help')
      expect(sent[0]!.text).toContain('TKT-') // ticket number in body
    })

    it('accepts all senders when emailAllowedDomains is empty', async () => {
      // Remove the allowlist
      await prisma.organization.update({
        where: { id: orgId },
        data: { settings: { emailAllowedDomains: [] } },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        payload: {
          from: 'anyone@anywhere.io',
          subject: 'Open inbox',
          text: 'Hello from anywhere',
        },
      })
      expect(res.statusCode).toBe(201)
    })

    it('returns 401 when webhook secret is wrong', async () => {
      // Rebuild app with a webhook secret set
      const securedApp = await buildApp({ ...testConfig, EMAIL_WEBHOOK_SECRET: 'my-secret' })

      const res = await securedApp.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        headers: { 'x-webhook-secret': 'wrong-secret' },
        payload: { from: 'user@example.com', subject: 'Test', text: 'Body' },
      })
      expect(res.statusCode).toBe(401)
      await securedApp.close()
    })

    it('passes when webhook secret matches', async () => {
      const securedApp = await buildApp({ ...testConfig, EMAIL_WEBHOOK_SECRET: 'my-secret' })

      const res = await securedApp.inject({
        method: 'POST',
        url: `/webhooks/email/${orgId}`,
        headers: { 'x-webhook-secret': 'my-secret' },
        payload: { from: 'user@example.com', subject: 'Correct secret', text: 'Body' },
      })
      // 404 because orgId belongs to main app's DB; just checking it passed auth
      expect(res.statusCode).not.toBe(401)
      await securedApp.close()
    })
  })
})
