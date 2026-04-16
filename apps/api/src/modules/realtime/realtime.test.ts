import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import WebSocket from 'ws'
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

/** Helper: wait for the next message on a WebSocket */
function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(JSON.parse(data.toString()) as Record<string, unknown>)
    })
  })
}

/** Helper: open a WebSocket connection and wait for the 'connected' frame */
function connect(baseUrl: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}/ws?token=${token}`)
    ws.once('open', () => {
      // Drain the 'connected' welcome frame before resolving
      ws.once('message', () => resolve(ws))
    })
    ws.once('error', reject)
    setTimeout(() => reject(new Error('WS connect timeout')), 3000)
  })
}

describe('WebSocket real-time updates', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL })
  let app: Awaited<ReturnType<typeof buildApp>>
  let wsBaseUrl: string
  let adminToken: string
  let orgId: string

  beforeAll(async () => {
    app = await buildApp(testConfig)
    // Listen on a real port so WebSocket clients can connect
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    wsBaseUrl = address.replace('http://', 'ws://')
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
        organizationName: 'WS Test Org',
        organizationSlug: 'ws-test',
        email: 'admin@ws.com',
        password: 'SecurePass123!',
        fullName: 'WS Admin',
      },
    })
    const body = reg.json()
    adminToken = body.accessToken
    orgId = body.user.organization.id
  })

  // ── Connection auth ────────────────────────────────────────────────────────

  describe('Connection', () => {
    it('closes with code 4001 when no token provided', async () => {
      const ws = new WebSocket(`${wsBaseUrl}/ws`)
      const code = await new Promise<number>((resolve) => {
        ws.on('close', (c) => resolve(c))
        ws.on('error', () => resolve(4001))
      })
      expect(code).toBe(4001)
    })

    it('closes with code 4001 for invalid JWT', async () => {
      const ws = new WebSocket(`${wsBaseUrl}/ws?token=not.a.jwt`)
      const code = await new Promise<number>((resolve) => {
        ws.on('close', (c) => resolve(c))
        ws.on('error', () => resolve(4001))
      })
      expect(code).toBe(4001)
    })

    it('connects successfully with valid JWT and receives welcome frame', async () => {
      const ws = new WebSocket(`${wsBaseUrl}/ws?token=${adminToken}`)
      const welcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>))
        ws.on('error', reject)
      })
      expect(welcome.event).toBe('connected')
      expect(welcome.room).toBe(`org:${orgId}`)
      ws.close()
    })
  })

  // ── Room subscription ──────────────────────────────────────────────────────

  describe('Ticket subscription', () => {
    it('joins a ticket room on subscribe message', async () => {
      const ws = await connect(wsBaseUrl, adminToken)

      // Use a static UUID — the server sends 'subscribed' regardless of whether
      // the ticket exists; validation is the client's responsibility
      const fakeTicketId = '00000000-0000-0000-0000-000000000001'
      ws.send(JSON.stringify({ subscribe: 'ticket', id: fakeTicketId }))
      const ack = await nextMessage(ws)
      expect(ack.event).toBe('subscribed')
      expect(ack.room).toBe(`ticket:${fakeTicketId}`)
      ws.close()
    })
  })

  // ── ticket.created event ───────────────────────────────────────────────────

  describe('ticket.created event', () => {
    it('broadcasts to org room when a ticket is created via REST', async () => {
      const ws = await connect(wsBaseUrl, adminToken)

      // Skip the ticket.created message from the initial ticket (if any were created)
      const msgPromise = nextMessage(ws, 3000)

      await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Realtime ticket', priority: 'high' },
      })

      const msg = await msgPromise
      expect(msg.event).toBe('ticket.created')
      expect((msg.data as Record<string, unknown>).title).toBe('Realtime ticket')
      ws.close()
    })
  })

  // ── ticket.updated event ───────────────────────────────────────────────────

  describe('ticket.updated event', () => {
    it('broadcasts to org room and ticket room when ticket is updated', async () => {
      // Create ticket first
      const createRes = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Update test', priority: 'medium' },
      })
      const ticketId = createRes.json().id

      // Connect and subscribe to ticket room
      const ws = await connect(wsBaseUrl, adminToken)

      // Drain the ticket.created event that arrives after connect but before subscribe
      // (the connect drains only the welcome frame; created event may come immediately)
      ws.send(JSON.stringify({ subscribe: 'ticket', id: ticketId }))
      // drain subscribe ack
      await nextMessage(ws)

      // Now update the ticket
      const updatePromise = nextMessage(ws, 3000)
      await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticketId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'in_progress' },
      })

      const msg = await updatePromise
      expect(msg.event).toBe('ticket.updated')
      expect((msg.data as Record<string, unknown>).id).toBe(ticketId)
      ws.close()
    })
  })

  // ── RoomManager unit ───────────────────────────────────────────────────────

  describe('RoomManager', () => {
    it('roomSize() tracks connected sockets', async () => {
      const ws1 = await connect(wsBaseUrl, adminToken)
      const ws2 = await connect(wsBaseUrl, adminToken)

      expect(app.rooms.roomSize(`org:${orgId}`)).toBe(2)

      await new Promise<void>((r) => { ws1.close(); ws1.on('close', r) })
      // Give server a tick to process close
      await new Promise((r) => setTimeout(r, 50))
      expect(app.rooms.roomSize(`org:${orgId}`)).toBe(1)

      ws2.close()
    })
  })
})
