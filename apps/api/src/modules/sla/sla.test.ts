import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../app.js'
import type { Env } from '../../config.js'
import { PrismaClient } from '@prisma/client'
import { SlaService } from './sla.service.js'

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

describe('SLA Engine', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let adminToken: string
  let orgId: string
  let ticketId: string

  beforeAll(async () => {
    app = await buildApp(testConfig)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  beforeEach(async () => {
    // Clean
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

    // Bootstrap org + admin
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        organizationName: 'SLA Test Org',
        organizationSlug: 'sla-test',
        email: 'admin@sla.com',
        password: 'SecurePass123!',
        fullName: 'SLA Admin',
      },
    })
    const body = reg.json()
    adminToken = body.accessToken
    orgId = body.user.organization.id

    // Note: register already creates 4 default SLA policies

    // Create a ticket to work with
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/tickets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'SLA Engine test ticket', priority: 'critical' },
    })
    ticketId = ticketRes.json().id
  })

  // ── SLA Policy CRUD ────────────────────────────────────────────────────────

  describe('SLA Policy CRUD', () => {
    it('GET /sla-policies lists org policies', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/sla-policies',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const policies = res.json()
      expect(policies).toHaveLength(4)
    })

    it('POST /sla-policies creates new policy', async () => {
      // Remove existing 'critical' first to test creation
      await prisma.slaPolicy.deleteMany({ where: { organizationId: orgId, priority: 'critical' } })

      const res = await app.inject({
        method: 'POST',
        url: '/sla-policies',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'New Critical',
          priority: 'critical',
          responseHours: 2,
          resolutionHours: 6,
          businessHoursOnly: false,
        },
      })
      expect(res.statusCode).toBe(201)
      const policy = res.json()
      expect(policy.name).toBe('New Critical')
      expect(policy.responseHours).toBe(2)
    })

    it('POST /sla-policies rejects duplicate priority', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/sla-policies',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Duplicate Critical',
          priority: 'critical',
          responseHours: 1,
          resolutionHours: 4,
          businessHoursOnly: false,
        },
      })
      expect(res.statusCode).toBe(409)
    })

    it('PATCH /sla-policies/:id updates policy', async () => {
      const policy = await prisma.slaPolicy.findFirst({ where: { organizationId: orgId, priority: 'low' } })
      const res = await app.inject({
        method: 'PATCH',
        url: `/sla-policies/${policy!.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { responseHours: 48 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().responseHours).toBe(48)
    })

    it('DELETE /sla-policies/:id removes policy', async () => {
      const policy = await prisma.slaPolicy.findFirst({ where: { organizationId: orgId, priority: 'low' } })
      const res = await app.inject({
        method: 'DELETE',
        url: `/sla-policies/${policy!.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(204)
      const deleted = await prisma.slaPolicy.findUnique({ where: { id: policy!.id } })
      expect(deleted).toBeNull()
    })
  })

  // ── GET /tickets/:id/sla ───────────────────────────────────────────────────

  describe('GET /tickets/:id/sla', () => {
    it('returns SLA status with percentElapsed and timeRemainingMs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/tickets/${ticketId}/sla`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.ticketId).toBe(ticketId)
      expect(body.records).toHaveLength(2) // response + resolution

      const responseRecord = body.records.find((r: { slaType: string }) => r.slaType === 'response')
      expect(responseRecord.status).toBe('active')
      expect(responseRecord.percentElapsed).toBeGreaterThanOrEqual(0)
      expect(responseRecord.percentElapsed).toBeLessThanOrEqual(100)
      expect(responseRecord.timeRemainingMs).toBeGreaterThan(0)
    })

    it('shows 404 for non-existent ticket', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets/00000000-0000-0000-0000-000000000000/sla',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ── Breach detection ───────────────────────────────────────────────────────

  describe('Breach detection', () => {
    it('processBreachCheck marks record as breached when now >= targetTime', async () => {
      const svc = new SlaService(app)
      const record = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'response' },
      })

      // Simulate future check: "now" is 2 hours past target
      const futureNow = new Date(record!.targetTime.getTime() + 2 * 60 * 60 * 1000)
      await svc.processBreachCheck(record!.id, futureNow)

      const updated = await prisma.ticketSlaRecord.findUnique({ where: { id: record!.id } })
      expect(updated!.status).toBe('breached')
      expect(updated!.breachedAt).not.toBeNull()
    })

    it('processBreachCheck does NOT breach if now < targetTime', async () => {
      const svc = new SlaService(app)
      const record = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'response' },
      })

      // "now" is 30 minutes before target
      const earlyNow = new Date(record!.targetTime.getTime() - 30 * 60 * 1000)
      await svc.processBreachCheck(record!.id, earlyNow)

      const unchanged = await prisma.ticketSlaRecord.findUnique({ where: { id: record!.id } })
      expect(unchanged!.status).toBe('active')
    })

    it('processBreachCheck is a no-op if SLA is already met', async () => {
      // Mark as met first
      await prisma.ticketSlaRecord.updateMany({
        where: { ticketId },
        data: { status: 'met', actualTime: new Date() },
      })

      const svc = new SlaService(app)
      const record = await prisma.ticketSlaRecord.findFirst({ where: { ticketId } })
      const futureNow = new Date(record!.targetTime.getTime() + 3600_000)
      await svc.processBreachCheck(record!.id, futureNow)

      // Still met, not breached
      const still = await prisma.ticketSlaRecord.findUnique({ where: { id: record!.id } })
      expect(still!.status).toBe('met')
    })
  })

  // ── Pause / Resume ─────────────────────────────────────────────────────────

  describe('SLA pause / resume', () => {
    it('pauses SLA when ticket → pending_customer', async () => {
      const before = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'response' },
      })
      expect(before!.status).toBe('active')

      // Move to in_progress first (open → in_progress is valid)
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'in_progress' },
      })

      // Now to pending_customer
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'pending_customer' },
      })

      // response SLA was already marked 'met' on open→in_progress; check resolution
      const paused = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'resolution' },
      })
      expect(paused!.status).toBe('paused')
      expect(paused!.pausedAt).not.toBeNull()
    })

    it('resumes SLA and extends targetTime when leaving pending_customer', async () => {
      // Get to pending_customer
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'in_progress' },
      })
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'pending_customer' },
      })

      const pausedRecord = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'resolution' },
      })
      const originalTarget = pausedRecord!.targetTime

      // Backdate pausedAt to simulate a 60-second pause (fast tests fire in <1ms)
      await prisma.ticketSlaRecord.update({
        where: { id: pausedRecord!.id },
        data: { pausedAt: new Date(Date.now() - 60_000) },
      })

      // Resume (back to in_progress)
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'in_progress' },
      })

      const resumed = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'resolution' },
      })
      expect(resumed!.status).toBe('active')
      expect(resumed!.pausedAt).toBeNull()
      expect(resumed!.pauseDuration).toBeGreaterThan(0)
      // targetTime must have been extended by the pause duration
      expect(resumed!.targetTime.getTime()).toBeGreaterThan(originalTarget.getTime())
    })
  })
})
