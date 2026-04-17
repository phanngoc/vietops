import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../app.js'
import type { Env } from '../../config.js'
import { PrismaClient } from '@prisma/client'

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

describe('Notifications API', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let adminToken: string
  let adminUserId: string
  let orgId: string

  beforeAll(async () => {
    app = await buildApp(testConfig)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  beforeEach(async () => {
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

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        organizationName: 'Notify Corp',
        organizationSlug: 'notify-corp',
        email: 'admin@notify.com',
        password: 'SecurePass123!',
        fullName: 'Admin User',
      },
    })
    const body = reg.json()
    adminToken = body.accessToken
    adminUserId = body.user.id
    orgId = body.user.organization.id

    app.mailer._sent?.splice(0)
  })

  // ── Prefs ─────────────────────────────────────────────────────────────────

  describe('GET /notifications/prefs', () => {
    it('returns default preferences', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const prefs = res.json()
      expect(prefs.email.ticketCreated).toBe(true)
      expect(prefs.email.ticketAssigned).toBe(true)
      expect(prefs.email.ticketUpdated).toBe(false)
      expect(prefs.email.slaBreached).toBe(true)
    })

    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/notifications/prefs' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('PATCH /notifications/prefs', () => {
    it('updates specified preference fields only', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ticketUpdated: true, ticketCreated: false },
      })
      expect(res.statusCode).toBe(200)
      const prefs = res.json()
      expect(prefs.email.ticketUpdated).toBe(true)
      expect(prefs.email.ticketCreated).toBe(false)
      // Unmentioned fields stay at default
      expect(prefs.email.ticketAssigned).toBe(true)
    })

    it('persists updated preferences across requests', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ticketResolved: false },
      })
      const res = await app.inject({
        method: 'GET',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.json().email.ticketResolved).toBe(false)
    })
  })

  // ── Template preview ──────────────────────────────────────────────────────

  describe('GET /notifications/templates/:event/preview', () => {
    it('returns rendered preview for ticket.created', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications/templates/ticket.created/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.event).toBe('ticket.created')
      expect(body.subject).toContain('TKT-2026-001')
      expect(body.body).toContain('TKT-2026-001')
    })

    it('returns 400 for unknown event', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications/templates/invalid.event/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // ── Inbox ─────────────────────────────────────────────────────────────────

  describe('GET /notifications', () => {
    it('returns empty inbox initially', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('returns notifications after ticket creation (via queueNotification)', async () => {
      // Create a ticket so queueNotification fires synchronously in test env
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Inbox test ticket', description: 'desc', priority: 'medium', tags: [] },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const notifications = res.json() as Array<{ title: string; readAt: string | null }>
      expect(notifications.length).toBeGreaterThan(0)
      expect(notifications[0]!.readAt).toBeNull()
    })
  })

  describe('PATCH /notifications/:id/read', () => {
    it('marks notification as read', async () => {
      // Create a ticket to generate a notification
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Read test ticket', description: 'desc', priority: 'low', tags: [] },
      })

      const listRes = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const notifications = listRes.json() as Array<{ id: string; readAt: string | null }>
      expect(notifications.length).toBeGreaterThan(0)
      const notifId = notifications[0]!.id

      const readRes = await app.inject({
        method: 'PATCH',
        url: `/notifications/${notifId}/read`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(readRes.statusCode).toBe(204)

      // Verify readAt is now set
      const notif = await prisma.notification.findUnique({ where: { id: notifId } })
      expect(notif?.readAt).not.toBeNull()
    })

    it('returns 404 for another user\'s notification', async () => {
      // Create a second user
      const invite = await app.inject({
        method: 'POST',
        url: '/auth/invite',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: 'agent@notify.com', fullName: 'Agent', role: 'agent' },
      })
      const { inviteToken } = invite.json()
      const accept = await app.inject({
        method: 'POST',
        url: `/auth/accept-invite/${inviteToken}`,
        payload: { password: 'Pass123!', fullName: 'Agent' },
      })
      const agentToken = accept.json().accessToken

      // Create a ticket to generate a notification for admin
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: '404 notif test', description: 'desc', priority: 'low', tags: [] },
      })

      const listRes = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const notifications = listRes.json() as Array<{ id: string }>
      expect(notifications.length).toBeGreaterThan(0)
      const adminNotifId = notifications[0]!.id

      // Agent tries to mark admin's notification as read
      const res = await app.inject({
        method: 'PATCH',
        url: `/notifications/${adminNotifId}/read`,
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ── Unsubscribe ───────────────────────────────────────────────────────────

  describe('GET /notifications/unsubscribe', () => {
    it('unsubscribes user from all email notifications via token', async () => {
      const { NotificationService } = await import('./notification.service.js')
      const svc = new NotificationService(app)
      const token = svc.generateUnsubscribeToken(adminUserId)

      const res = await app.inject({
        method: 'GET',
        url: `/notifications/unsubscribe?token=${token}`,
      })
      expect(res.statusCode).toBe(200)

      // All prefs should now be false
      const prefsRes = await app.inject({
        method: 'GET',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const prefs = prefsRes.json()
      expect(prefs.email.ticketCreated).toBe(false)
      expect(prefs.email.slaBreached).toBe(false)
    })

    it('respects disabled preferences — no email sent when pref is off', async () => {
      // Disable all email notifications
      await app.inject({
        method: 'PATCH',
        url: '/notifications/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ticketCreated: false },
      })
      app.mailer._sent?.splice(0)

      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Silent ticket', description: 'desc', priority: 'low', tags: [] },
      })

      // ticketCreated disabled — no email sent for that event
      const sentForCreated = app.mailer._sent?.filter((m) =>
        m.subject?.includes('Ticket mới') || m.subject?.includes('New ticket'),
      )
      expect(sentForCreated?.length ?? 0).toBe(0)
    })
  })

  // ── Email delivery ─────────────────────────────────────────────────────────

  describe('Email delivery', () => {
    it('sends an email when ticket.created fires', async () => {
      app.mailer._sent?.splice(0)

      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Email test ticket', description: 'desc', priority: 'high', tags: [] },
      })

      expect(app.mailer._sent?.length).toBeGreaterThan(0)
      const mail = app.mailer._sent?.[0]
      expect(mail?.to).toBe('admin@notify.com')
      expect(mail?.subject).toContain('Ticket mới')
    })

    it('register seeds all 6 default notification templates', async () => {
      const templates = await prisma.notificationTemplate.findMany({
        where: { organizationId: orgId },
      })
      expect(templates.length).toBe(6)
      const events = templates.map((t) => t.event)
      expect(events).toContain('ticket.created')
      expect(events).toContain('ticket.assigned')
      expect(events).toContain('ticket.resolved')
      expect(events).toContain('sla.breached')
    })
  })
})
