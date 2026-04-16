import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'

export async function realtimeRoutes(app: FastifyInstance) {
  /**
   * GET /ws?token=<JWT>
   *
   * WebSocket endpoint. Client must pass a valid JWT either as:
   *   - query param:  ?token=<JWT>
   *   - header:       Authorization: Bearer <JWT>  (set before upgrade)
   *
   * On connect: client is joined to room `org:{organizationId}`.
   * Messages received from client: JSON `{ subscribe: 'ticket', id: '<ticketId>' }`
   *   → joins additional room `ticket:{ticketId}`
   */
  app.get(
    '/ws',
    { websocket: true },
    async (socket: WebSocket, request) => {
      // ── Auth ───────────────────────────────────────────────────────────────
      const token =
        (request.query as Record<string, string>).token ??
        request.headers.authorization?.replace(/^Bearer\s+/i, '')

      if (!token) {
        socket.close(4001, 'Missing token')
        return
      }

      let payload: { userId: string; organizationId: string; role: string; email: string }
      try {
        payload = app.jwt.verify<typeof payload>(token)
      } catch {
        socket.close(4001, 'Invalid token')
        return
      }

      const orgRoom = `org:${payload.organizationId}`
      app.rooms.join(socket, orgRoom)

      // ── Inbound messages (subscribe to specific ticket) ───────────────────
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { subscribe?: string; id?: string }
          if (msg.subscribe === 'ticket' && msg.id) {
            app.rooms.join(socket, `ticket:${msg.id}`)
            socket.send(JSON.stringify({ event: 'subscribed', room: `ticket:${msg.id}` }))
          }
        } catch {
          // Ignore malformed messages
        }
      })

      // ── Cleanup on disconnect ─────────────────────────────────────────────
      socket.on('close', () => {
        app.rooms.leave(socket)
      })

      // ── Welcome frame ─────────────────────────────────────────────────────
      socket.send(
        JSON.stringify({
          event: 'connected',
          room: orgRoom,
          userId: payload.userId,
        }),
      )
    },
  )
}
