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

describe('Auth API', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp(testConfig)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  beforeEach(async () => {
    // Clean up in reverse dependency order
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
  })

  describe('POST /auth/register', () => {
    it('creates organization and admin user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Test Corp',
          organizationSlug: 'test-corp',
          email: 'admin@test.com',
          password: 'SecurePass123!',
          fullName: 'Test Admin',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.user.email).toBe('admin@test.com')
      expect(body.user.role).toBe('admin')
      expect(body.user.organization.slug).toBe('test-corp')

      // Verify default SLA policies were created
      const policies = await prisma.slaPolicy.findMany({
        where: { organizationId: body.user.organization.id },
      })
      expect(policies).toHaveLength(4)
    })

    it('rejects duplicate org slug', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Test Corp',
          organizationSlug: 'test-corp',
          email: 'admin@test.com',
          password: 'SecurePass123!',
          fullName: 'Test Admin',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Test Corp 2',
          organizationSlug: 'test-corp',
          email: 'admin2@test.com',
          password: 'SecurePass123!',
          fullName: 'Test Admin 2',
        },
      })

      expect(response.statusCode).toBe(409)
    })

    it('validates input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'not-email', password: '123' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Login Test',
          organizationSlug: 'login-test',
          email: 'user@login.com',
          password: 'SecurePass123!',
          fullName: 'Login User',
        },
      })
    })

    it('returns tokens for valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'user@login.com', password: 'SecurePass123!' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.user.email).toBe('user@login.com')
    })

    it('rejects wrong password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'user@login.com', password: 'WrongPass123!' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('rejects non-existent email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'noone@test.com', password: 'SecurePass123!' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /auth/refresh', () => {
    it('rotates refresh token', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Refresh Test',
          organizationSlug: 'refresh-test',
          email: 'user@refresh.com',
          password: 'SecurePass123!',
          fullName: 'Refresh User',
        },
      })
      const { refreshToken } = registerRes.json()

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).not.toBe(refreshToken)

      // Old token should be revoked
      const retryRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(retryRes.statusCode).toBe(401)
    })
  })

  describe('POST /auth/logout', () => {
    it('invalidates refresh token', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Logout Test',
          organizationSlug: 'logout-test',
          email: 'user@logout.com',
          password: 'SecurePass123!',
          fullName: 'Logout User',
        },
      })
      const { refreshToken } = registerRes.json()

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken },
      })
      expect(logoutRes.statusCode).toBe(200)

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(refreshRes.statusCode).toBe(401)
    })
  })

  describe('POST /auth/invite + accept-invite', () => {
    it('full invite and accept flow', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'Invite Test',
          organizationSlug: 'invite-test',
          email: 'admin@invite.com',
          password: 'SecurePass123!',
          fullName: 'Invite Admin',
        },
      })
      const { accessToken } = registerRes.json()

      // Invite user
      const inviteRes = await app.inject({
        method: 'POST',
        url: '/auth/invite',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          email: 'newuser@invite.com',
          fullName: 'New User',
          role: 'agent',
          department: 'IT Support',
        },
      })

      expect(inviteRes.statusCode).toBe(201)
      const { inviteToken } = inviteRes.json()

      // Accept invite
      const acceptRes = await app.inject({
        method: 'POST',
        url: `/auth/accept-invite/${inviteToken}`,
        payload: { password: 'NewUserPass123!' },
      })

      expect(acceptRes.statusCode).toBe(200)
      const body = acceptRes.json()
      expect(body.user.email).toBe('newuser@invite.com')
      expect(body.user.role).toBe('agent')
      expect(body.accessToken).toBeDefined()

      // New user can login
      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'newuser@invite.com', password: 'NewUserPass123!' },
      })
      expect(loginRes.statusCode).toBe(200)
    })

    it('rejects invite from non-admin/manager', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          organizationName: 'NoInvite',
          organizationSlug: 'noinvite',
          email: 'admin@noinvite.com',
          password: 'SecurePass123!',
          fullName: 'Admin',
        },
      })
      const { accessToken: adminToken } = registerRes.json()

      // Invite a regular user
      const inviteRes = await app.inject({
        method: 'POST',
        url: '/auth/invite',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: 'regular@noinvite.com', fullName: 'Regular', role: 'user' },
      })
      const { inviteToken } = inviteRes.json()

      const acceptRes = await app.inject({
        method: 'POST',
        url: `/auth/accept-invite/${inviteToken}`,
        payload: { password: 'RegularPass123!' },
      })
      const { accessToken: userToken } = acceptRes.json()

      // Regular user tries to invite — should fail
      const failedInvite = await app.inject({
        method: 'POST',
        url: '/auth/invite',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { email: 'another@noinvite.com', fullName: 'Another', role: 'user' },
      })

      expect(failedInvite.statusCode).toBe(403)
    })

    it('rejects invite without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/invite',
        payload: { email: 'test@test.com', fullName: 'Test', role: 'user' },
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
