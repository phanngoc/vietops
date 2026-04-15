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

describe('Ticket API', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>

  // Auth tokens for different roles
  let adminToken: string
  let agentToken: string
  let userToken: string
  let user2Token: string
  let orgId: string
  let agentId: string

  beforeAll(async () => {
    app = await buildApp(testConfig)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  beforeEach(async () => {
    // Clean up
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

    // Setup: register org + create users
    const registerRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        organizationName: 'Ticket Test Org',
        organizationSlug: 'ticket-test',
        email: 'admin@ticket.com',
        password: 'SecurePass123!',
        fullName: 'Ticket Admin',
      },
    })
    const adminBody = registerRes.json()
    adminToken = adminBody.accessToken
    orgId = adminBody.user.organization.id

    // Invite and accept agent
    const inviteAgentRes = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'agent@ticket.com', fullName: 'Test Agent', role: 'agent' },
    })
    const { inviteToken: agentInviteToken } = inviteAgentRes.json()
    const agentAcceptRes = await app.inject({
      method: 'POST',
      url: `/auth/accept-invite/${agentInviteToken}`,
      payload: { password: 'AgentPass123!' },
    })
    agentToken = agentAcceptRes.json().accessToken
    agentId = agentAcceptRes.json().user.id

    // Invite and accept user
    const inviteUserRes = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'user1@ticket.com', fullName: 'Test User 1', role: 'user' },
    })
    const { inviteToken: userInviteToken } = inviteUserRes.json()
    const userAcceptRes = await app.inject({
      method: 'POST',
      url: `/auth/accept-invite/${userInviteToken}`,
      payload: { password: 'UserPass123!' },
    })
    userToken = userAcceptRes.json().accessToken

    // Second user
    const inviteUser2Res = await app.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'user2@ticket.com', fullName: 'Test User 2', role: 'user' },
    })
    const { inviteToken: user2InviteToken } = inviteUser2Res.json()
    const user2AcceptRes = await app.inject({
      method: 'POST',
      url: `/auth/accept-invite/${user2InviteToken}`,
      payload: { password: 'UserPass123!' },
    })
    user2Token = user2AcceptRes.json().accessToken

    // Create default SLA policies
    await prisma.slaPolicy.createMany({
      data: [
        { organizationId: orgId, name: 'Critical', priority: 'critical', responseHours: 1, resolutionHours: 4, businessHoursOnly: false },
        { organizationId: orgId, name: 'High', priority: 'high', responseHours: 4, resolutionHours: 8, businessHoursOnly: true },
        { organizationId: orgId, name: 'Medium', priority: 'medium', responseHours: 8, resolutionHours: 24, businessHoursOnly: true },
        { organizationId: orgId, name: 'Low', priority: 'low', responseHours: 24, resolutionHours: 72, businessHoursOnly: true },
      ],
    })
  })

  // ─── POST /tickets ──────────────────────────────────────────────────────────

  describe('POST /tickets', () => {
    it('creates a ticket with auto-generated ticket number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          title: 'My laptop is broken',
          description: 'The screen went black after Windows update',
          priority: 'high',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/)
      expect(body.status).toBe('open')
      expect(body.priority).toBe('high')
      expect(body.requester.email).toBe('user1@ticket.com')
    })

    it('creates SLA records for ticket', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Critical system down', priority: 'critical' },
      })

      expect(res.statusCode).toBe(201)
      const ticketId = res.json().id

      const slaRecords = await prisma.ticketSlaRecord.findMany({ where: { ticketId } })
      expect(slaRecords).toHaveLength(2)
      expect(slaRecords.map((r) => r.slaType).sort()).toEqual(['resolution', 'response'])
      expect(slaRecords.every((r) => r.status === 'active')).toBe(true)
    })

    it('creates activity log entry on creation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Need VPN access', priority: 'medium' },
      })
      const ticketId = res.json().id

      const activities = await prisma.ticketActivity.findMany({ where: { ticketId } })
      expect(activities).toHaveLength(1)
      expect(activities[0]?.action).toBe('created')
    })

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        payload: { title: 'No auth ticket', priority: 'low' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('validates input - title too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Hi', priority: 'medium' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('auto-increments ticket numbers within org', async () => {
      const t1 = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'First ticket ever', priority: 'low' },
      })
      const t2 = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Second ticket ever', priority: 'low' },
      })

      const n1 = t1.json().ticketNumber
      const n2 = t2.json().ticketNumber
      const seq1 = parseInt(n1.split('-')[2])
      const seq2 = parseInt(n2.split('-')[2])
      expect(seq2).toBe(seq1 + 1)
    })
  })

  // ─── GET /tickets ───────────────────────────────────────────────────────────

  describe('GET /tickets', () => {
    beforeEach(async () => {
      // Create tickets as different users
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'User1 laptop issue', priority: 'high' },
      })
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${user2Token}` },
        payload: { title: 'User2 software issue', priority: 'medium' },
      })
      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'User1 network issue', priority: 'low' },
      })
    })

    it('agent sees all org tickets', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets',
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(3)
      expect(res.json().pagination.total).toBe(3)
    })

    it('user only sees own tickets (RBAC)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(2) // user1's 2 tickets
      res.json().data.forEach((t: { requester: { email: string } }) => {
        expect(t.requester.email).toBe('user1@ticket.com')
      })
    })

    it('supports pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets?page=1&limit=2',
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(2)
      expect(body.pagination.totalPages).toBe(2)
    })

    it('filters by priority', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets?priority=high',
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().data[0].priority).toBe('high')
    })

    it('searches by title', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets?search=laptop',
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().data[0].title).toContain('laptop')
    })
  })

  // ─── GET /tickets/:id ───────────────────────────────────────────────────────

  describe('GET /tickets/:id', () => {
    it('returns full ticket detail with comments and activities', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Detail test ticket', priority: 'medium' },
      })
      const ticketId = createRes.json().id

      const res = await app.inject({
        method: 'GET',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(ticketId)
      expect(body.comments).toBeDefined()
      expect(body.activities).toBeDefined()
      expect(body.slaRecords).toBeDefined()
    })

    it('returns 404 for non-existent ticket', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${agentToken}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('user cannot see other users tickets', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${user2Token}` },
        payload: { title: 'User2 private ticket', priority: 'low' },
      })
      const ticketId = createRes.json().id

      const res = await app.inject({
        method: 'GET',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ─── PATCH /tickets/:id ─────────────────────────────────────────────────────

  describe('PATCH /tickets/:id', () => {
    let ticketId: string

    beforeEach(async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Update test ticket', priority: 'medium' },
      })
      ticketId = createRes.json().id
    })

    it('agent can update status', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'in_progress' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('in_progress')
    })

    it('creates activity log on status change', async () => {
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'in_progress' },
      })

      const activities = await prisma.ticketActivity.findMany({
        where: { ticketId, action: 'status_changed' },
      })
      expect(activities).toHaveLength(1)
      expect(activities[0]?.oldValue).toBe('open')
      expect(activities[0]?.newValue).toBe('in_progress')
    })

    it('rejects invalid status transitions', async () => {
      // open → closed is valid, but open → resolved is not
      const res = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'resolved' }, // invalid: must go through in_progress first
      })
      expect(res.statusCode).toBe(400)
    })

    it('marks response SLA as met on first status change from open', async () => {
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'in_progress' },
      })

      const slaRecord = await prisma.ticketSlaRecord.findFirst({
        where: { ticketId, slaType: 'response' },
      })
      expect(slaRecord?.status).toBe('met')
      expect(slaRecord?.actualTime).not.toBeNull()
    })

    it('sets resolvedAt when status changes to resolved', async () => {
      // First move to in_progress
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'in_progress' },
      })

      const res = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'resolved' },
      })

      expect(res.statusCode).toBe(200)
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
      expect(ticket?.resolvedAt).not.toBeNull()
    })

    it('agent can assign ticket', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { assigneeId: agentId },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().assignee?.id).toBe(agentId)
    })

    it('user cannot update other users tickets', async () => {
      const otherTicketRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${user2Token}` },
        payload: { title: 'User2 ticket', priority: 'low' },
      })
      const otherTicketId = otherTicketRes.json().id

      const res = await app.inject({
        method: 'PATCH',
        url: `/tickets/${otherTicketId}`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Hacked title' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // ─── Comments ───────────────────────────────────────────────────────────────

  describe('POST /tickets/:id/comments', () => {
    let ticketId: string

    beforeEach(async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Comment test ticket', priority: 'medium' },
      })
      ticketId = createRes.json().id
    })

    it('user can add public comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { body: 'I can reproduce this issue every time', isInternal: false },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().body).toBe('I can reproduce this issue every time')
      expect(res.json().isInternal).toBe(false)
    })

    it('agent can add internal note', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { body: 'Internal: check server logs first', isInternal: true },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().isInternal).toBe(true)
    })

    it('user cannot add internal note', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { body: 'Trying to add internal note', isInternal: true },
      })
      expect(res.statusCode).toBe(403)
    })

    it('user cannot see internal notes in ticket detail', async () => {
      // Agent adds internal note
      await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { body: 'Secret internal note', isInternal: true },
      })

      // User fetches ticket
      const res = await app.inject({
        method: 'GET',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${userToken}` },
      })
      const comments = res.json().comments
      expect(comments.every((c: { isInternal: boolean }) => !c.isInternal)).toBe(true)
    })
  })

  // ─── Activity Log ─────────────────────────────────────────────────────────

  describe('GET /tickets/:id/activities', () => {
    it('returns activity log in reverse chronological order', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: 'Activity log test', priority: 'medium' },
      })
      const ticketId = createRes.json().id

      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { status: 'in_progress' },
      })

      const res = await app.inject({
        method: 'GET',
        url: `/tickets/${ticketId}/activities`,
        headers: { authorization: `Bearer ${agentToken}` },
      })

      expect(res.statusCode).toBe(200)
      const activities = res.json()
      expect(activities.length).toBeGreaterThanOrEqual(2)
      // First activity should be most recent (status_changed)
      expect(activities[0].action).toBe('status_changed')
    })
  })
})
