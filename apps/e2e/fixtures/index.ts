import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/vietops_test'
const BASE_URL = 'http://localhost:3099'

// ─── Shared Prisma instance ───────────────────────────────────────────────────

export const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })

// ─── DB cleanup (call in beforeEach) ─────────────────────────────────────────

export async function cleanDb() {
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
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export interface AuthSession {
  accessToken: string
  refreshToken: string
  userId: string
  orgId: string
}

export async function registerAdmin(
  request: APIRequestContext,
  opts?: { orgSlug?: string; email?: string },
): Promise<AuthSession> {
  const res = await request.post(`${BASE_URL}/auth/register`, {
    data: {
      organizationName: 'E2E Test Org',
      organizationSlug: opts?.orgSlug ?? 'e2e-test',
      email: opts?.email ?? 'admin@e2e.com',
      password: 'SecurePass123!',
      fullName: 'E2E Admin',
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    orgId: body.user.organization.id,
  }
}

export async function inviteAndAccept(
  request: APIRequestContext,
  adminToken: string,
  opts: { email: string; fullName: string; role: string; password: string },
): Promise<AuthSession> {
  // Invite
  const inviteRes = await request.post(`${BASE_URL}/auth/invite`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { email: opts.email, fullName: opts.fullName, role: opts.role },
  })
  expect(inviteRes.ok()).toBeTruthy()
  const { inviteToken } = await inviteRes.json()

  // Accept
  const acceptRes = await request.post(`${BASE_URL}/auth/accept-invite/${inviteToken}`, {
    data: { password: opts.password },
  })
  expect(acceptRes.ok()).toBeTruthy()
  const body = await acceptRes.json()
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    orgId: body.user.organization.id,
  }
}

export async function createDefaultSlaPolicies(orgId: string) {
  await prisma.slaPolicy.createMany({
    data: [
      { organizationId: orgId, name: 'Critical', priority: 'critical', responseHours: 1, resolutionHours: 4, businessHoursOnly: false },
      { organizationId: orgId, name: 'High', priority: 'high', responseHours: 4, resolutionHours: 8, businessHoursOnly: true },
      { organizationId: orgId, name: 'Medium', priority: 'medium', responseHours: 8, resolutionHours: 24, businessHoursOnly: true },
      { organizationId: orgId, name: 'Low', priority: 'low', responseHours: 24, resolutionHours: 72, businessHoursOnly: true },
    ],
  })
}

// ─── Custom test fixture ──────────────────────────────────────────────────────

interface E2EFixtures {
  admin: AuthSession
  agent: AuthSession
  user: AuthSession
}

export const test = base.extend<E2EFixtures>({
  admin: async ({ request }, use) => {
    await cleanDb()
    const session = await registerAdmin(request)
    await createDefaultSlaPolicies(session.orgId)
    await use(session)
  },

  agent: async ({ request, admin }, use) => {
    const session = await inviteAndAccept(request, admin.accessToken, {
      email: 'agent@e2e.com',
      fullName: 'E2E Agent',
      role: 'agent',
      password: 'AgentPass123!',
    })
    await use(session)
  },

  user: async ({ request, admin }, use) => {
    const session = await inviteAndAccept(request, admin.accessToken, {
      email: 'user@e2e.com',
      fullName: 'E2E User',
      role: 'user',
      password: 'UserPass123!',
    })
    await use(session)
  },
})

export { expect }
