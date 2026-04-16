import { test, expect, cleanDb, registerAdmin, prisma } from '../fixtures/index.js'

const BASE = 'http://localhost:3099'

test.describe('Auth — complete flows', () => {
  test.beforeEach(cleanDb)

  test('register creates org + admin, returns JWT pair', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        organizationName: 'Acme Corp',
        organizationSlug: 'acme',
        email: 'boss@acme.com',
        password: 'SecurePass123!',
        fullName: 'Acme Boss',
      },
    })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.email).toBe('boss@acme.com')
    expect(body.user.role).toBe('admin')
    expect(body.user.organization.slug).toBe('acme')

    // Verify org + user persisted
    const org = await prisma.organization.findUnique({ where: { slug: 'acme' } })
    expect(org).not.toBeNull()
    const slas = await prisma.slaPolicy.findMany({ where: { organizationId: org!.id } })
    expect(slas).toHaveLength(4) // register creates 4 default SLA policies
  })

  test('rejects duplicate slug', async ({ request }) => {
    await registerAdmin(request, { orgSlug: 'dupe' })
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        organizationName: 'Other',
        organizationSlug: 'dupe',
        email: 'other@other.com',
        password: 'SecurePass123!',
        fullName: 'Other',
      },
    })
    expect(res.status()).toBe(409)
  })

  test('login → refresh → logout flow', async ({ request }) => {
    await registerAdmin(request)

    // Login
    const loginRes = await request.post(`${BASE}/auth/login`, {
      data: { email: 'admin@e2e.com', password: 'SecurePass123!' },
    })
    expect(loginRes.status()).toBe(200)
    const { accessToken, refreshToken } = await loginRes.json()

    // Refresh — returns new token pair
    const refreshRes = await request.post(`${BASE}/auth/refresh`, {
      data: { refreshToken },
    })
    expect(refreshRes.status()).toBe(200)
    const refreshed = await refreshRes.json()
    expect(refreshed.accessToken).toBeTruthy()
    // Refresh token must rotate (new token issued)
    expect(refreshed.refreshToken).not.toBe(refreshToken)

    // Old refresh token is revoked
    const reusedRes = await request.post(`${BASE}/auth/refresh`, {
      data: { refreshToken },
    })
    expect(reusedRes.status()).toBe(401)

    // Logout with new token
    const logoutRes = await request.post(`${BASE}/auth/logout`, {
      data: { refreshToken: refreshed.refreshToken },
    })
    expect(logoutRes.status()).toBe(200)

    // Token now invalid
    const afterLogout = await request.post(`${BASE}/auth/refresh`, {
      data: { refreshToken: refreshed.refreshToken },
    })
    expect(afterLogout.status()).toBe(401)
  })

  test('invite → accept → login as new member', async ({ request }) => {
    const admin = await registerAdmin(request)

    // Invite agent
    const inviteRes = await request.post(`${BASE}/auth/invite`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { email: 'newagent@e2e.com', fullName: 'New Agent', role: 'agent' },
    })
    expect(inviteRes.status()).toBe(201)
    const { inviteToken } = await inviteRes.json()
    expect(inviteToken).toBeTruthy()

    // Accept
    const acceptRes = await request.post(`${BASE}/auth/accept-invite/${inviteToken}`, {
      data: { password: 'AgentPass123!' },
    })
    expect(acceptRes.status()).toBe(200)
    const accepted = await acceptRes.json()
    expect(accepted.user.role).toBe('agent')
    expect(accepted.user.organization.id).toBe(admin.orgId)

    // Can now login
    const loginRes = await request.post(`${BASE}/auth/login`, {
      data: { email: 'newagent@e2e.com', password: 'AgentPass123!' },
    })
    expect(loginRes.status()).toBe(200)
  })

  test('non-admin cannot invite', async ({ request }) => {
    const admin = await registerAdmin(request)

    // Invite a plain user
    const inviteRes = await request.post(`${BASE}/auth/invite`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { email: 'plain@e2e.com', fullName: 'Plain User', role: 'user' },
    })
    const { inviteToken } = await inviteRes.json()
    const acceptRes = await request.post(`${BASE}/auth/accept-invite/${inviteToken}`, {
      data: { password: 'PlainPass123!' },
    })
    const { accessToken: userToken } = await acceptRes.json()

    // User tries to invite someone else
    const badInvite = await request.post(`${BASE}/auth/invite`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { email: 'another@e2e.com', fullName: 'Another', role: 'user' },
    })
    expect(badInvite.status()).toBe(403)
  })
})
