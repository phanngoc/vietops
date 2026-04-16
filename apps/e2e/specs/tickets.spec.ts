import { test, expect, prisma } from '../fixtures/index.js'

const BASE = 'http://localhost:3099'

test.describe('Ticket lifecycle — complete E2E journey', () => {
  // Fixtures auto-wire: admin (with org + SLA), agent, user

  test('full ticket journey: create → in_progress → resolved → closed', async ({
    request,
    admin,
    agent,
  }) => {
    // 1. Admin creates ticket
    const createRes = await request.post(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: {
        title: 'Production database is unreachable',
        description: 'All reads timing out since 14:00',
        priority: 'critical',
        source: 'portal',
      },
    })
    expect(createRes.status()).toBe(201)
    const ticket = await createRes.json()
    expect(ticket.ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/)
    expect(ticket.status).toBe('open')
    expect(ticket.slaPolicy).not.toBeNull()

    // SLA records created
    const slaRecords = await prisma.ticketSlaRecord.findMany({ where: { ticketId: ticket.id } })
    expect(slaRecords).toHaveLength(2)
    const responseRecord = slaRecords.find((r) => r.slaType === 'response')
    expect(responseRecord?.status).toBe('active')

    // 2. Agent picks it up (open → in_progress)
    const inProgressRes = await request.patch(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { status: 'in_progress', assigneeId: agent.userId },
    })
    expect(inProgressRes.status()).toBe(200)
    const inProgress = await inProgressRes.json()
    expect(inProgress.status).toBe('in_progress')

    // Response SLA now met
    const updatedSla = await prisma.ticketSlaRecord.findFirst({
      where: { ticketId: ticket.id, slaType: 'response' },
    })
    expect(updatedSla?.status).toBe('met')

    // Activity log has status_changed + assigned entries
    const activitiesRes = await request.get(`${BASE}/tickets/${ticket.id}/activities`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
    })
    const activities = await activitiesRes.json()
    const actions = activities.map((a: { action: string }) => a.action)
    expect(actions).toContain('status_changed')
    expect(actions).toContain('assigned')

    // 3. Agent resolves (in_progress → resolved)
    const resolveRes = await request.patch(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { status: 'resolved' },
    })
    expect(resolveRes.status()).toBe(200)
    const resolved = await resolveRes.json()
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedAt).not.toBeNull()

    // Resolution SLA now met
    const resSla = await prisma.ticketSlaRecord.findFirst({
      where: { ticketId: ticket.id, slaType: 'resolution' },
    })
    expect(resSla?.status).toBe('met')

    // 4. Admin closes (resolved → closed)
    const closeRes = await request.patch(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { status: 'closed' },
    })
    expect(closeRes.status()).toBe(200)
    expect((await closeRes.json()).status).toBe('closed')
  })

  test('status machine rejects invalid transition', async ({ request, agent }) => {
    const createRes = await request.post(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { title: 'Needs to be transitioned', priority: 'low' },
    })
    const ticket = await createRes.json()

    // open → resolved is not a valid transition
    const res = await request.patch(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { status: 'resolved' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toContain('Invalid status transition')
  })

  test('RBAC: user sees only own tickets', async ({ request, admin, user }) => {
    // Admin creates a ticket
    await request.post(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { title: 'Admin ticket not visible to user', priority: 'medium' },
    })

    // User creates a ticket
    await request.post(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { title: 'My own ticket', priority: 'low' },
    })

    // User's list contains only their ticket
    const listRes = await request.get(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
    const list = await listRes.json()
    expect(list.pagination.total).toBe(1)
    expect(list.data[0].title).toBe('My own ticket')

    // Admin sees all
    const adminList = await request.get(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    })
    const adminBody = await adminList.json()
    expect(adminBody.pagination.total).toBe(2)
  })

  test('comment flow: public visible to user, internal hidden', async ({
    request,
    agent,
    user,
  }) => {
    // User creates ticket
    const createRes = await request.post(`${BASE}/tickets`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { title: 'I need help with something', priority: 'medium' },
    })
    const ticket = await createRes.json()

    // Agent adds public comment
    const pubRes = await request.post(`${BASE}/tickets/${ticket.id}/comments`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { body: 'We are looking into this.', isInternal: false },
    })
    expect(pubRes.status()).toBe(201)

    // Agent adds internal note
    const intRes = await request.post(`${BASE}/tickets/${ticket.id}/comments`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
      data: { body: 'Customer seems unhappy — escalate to L2.', isInternal: true },
    })
    expect(intRes.status()).toBe(201)

    // User cannot add internal note
    const badNoteRes = await request.post(`${BASE}/tickets/${ticket.id}/comments`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { body: 'Secret note attempt', isInternal: true },
    })
    expect(badNoteRes.status()).toBe(403)

    // User's view of ticket has only public comment
    const detailRes = await request.get(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
    const detail = await detailRes.json()
    expect(detail.comments).toHaveLength(1)
    expect(detail.comments[0].isInternal).toBe(false)

    // Agent sees both
    const agentDetailRes = await request.get(`${BASE}/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${agent.accessToken}` },
    })
    const agentDetail = await agentDetailRes.json()
    expect(agentDetail.comments).toHaveLength(2)
  })

  test('pagination and search work end-to-end', async ({ request, admin }) => {
    // Create 5 tickets
    for (let i = 1; i <= 5; i++) {
      await request.post(`${BASE}/tickets`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        data: {
          title: `Ticket number ${i} about database`,
          priority: i % 2 === 0 ? 'high' : 'low',
        },
      })
    }

    // Page 1, limit 2
    const page1 = await request.get(`${BASE}/tickets?limit=2&page=1`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    })
    const p1Body = await page1.json()
    expect(p1Body.pagination.total).toBe(5)
    expect(p1Body.pagination.totalPages).toBe(3)
    expect(p1Body.data).toHaveLength(2)

    // Search
    const searchRes = await request.get(`${BASE}/tickets?search=database`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    })
    const searchBody = await searchRes.json()
    expect(searchBody.pagination.total).toBe(5) // all contain "database"

    // Filter by priority
    const highRes = await request.get(`${BASE}/tickets?priority=high`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    })
    const highBody = await highRes.json()
    expect(highBody.pagination.total).toBe(2)
  })

  test('auto-increments ticket numbers per org', async ({ request, admin }) => {
    const t1 = await (
      await request.post(`${BASE}/tickets`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        data: { title: 'First ticket ever created', priority: 'low' },
      })
    ).json()
    const t2 = await (
      await request.post(`${BASE}/tickets`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        data: { title: 'Second ticket ever created', priority: 'low' },
      })
    ).json()

    const year = new Date().getFullYear()
    expect(t1.ticketNumber).toBe(`TKT-${year}-00001`)
    expect(t2.ticketNumber).toBe(`TKT-${year}-00002`)
  })
})
