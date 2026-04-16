import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import type { Redis } from 'ioredis'

export type WsEventName = 'ticket.created' | 'ticket.updated' | 'ticket.sla_warning' | 'notification.new'

export interface WsMessage {
  event: WsEventName
  data: unknown
}

// ── RoomManager ───────────────────────────────────────────────────────────────

/**
 * Manages per-org WebSocket rooms.
 *
 * Local delivery:  Map<roomName, Set<WebSocket>>
 * Cross-instance:  Redis pub/sub channel `ws:rooms:{roomName}`
 *
 * In test env, Redis pub/sub is skipped and messages are delivered locally only,
 * which is sufficient since tests run single-instance.
 */
export class RoomManager {
  /** room → connected sockets on this instance */
  private rooms = new Map<string, Set<WebSocket>>()
  /** socket → rooms it has joined (for cleanup on close) */
  private socketRooms = new Map<WebSocket, Set<string>>()
  private subscriber: Redis | null = null

  constructor(private readonly app: FastifyInstance) {}

  async start() {
    if (this.app.config.NODE_ENV === 'test') return

    // Dedicated subscriber connection (ioredis subscriber cannot issue commands)
    const { Redis: IORedis } = await import('ioredis')
    this.subscriber = new IORedis(this.app.config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })

    this.subscriber.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      const room = channel.replace('ws:rooms:', '')
      this.deliverLocal(room, raw)
    })

    await this.subscriber.psubscribe('ws:rooms:*')
  }

  async stop() {
    await this.subscriber?.quit()
  }

  join(socket: WebSocket, room: string) {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set())
    this.rooms.get(room)!.add(socket)

    if (!this.socketRooms.has(socket)) this.socketRooms.set(socket, new Set())
    this.socketRooms.get(socket)!.add(room)
  }

  leave(socket: WebSocket) {
    const rooms = this.socketRooms.get(socket)
    if (rooms) {
      for (const room of rooms) {
        this.rooms.get(room)?.delete(socket)
      }
      this.socketRooms.delete(socket)
    }
  }

  /**
   * Emit an event to all clients in a room.
   * In non-test env, publishes via Redis so other instances forward it too.
   */
  async emit(room: string, event: WsEventName, data: unknown) {
    const raw = JSON.stringify({ event, data } satisfies WsMessage)

    if (this.app.config.NODE_ENV !== 'test') {
      // Publish to Redis — subscriber on every instance (including this one) will deliver locally
      await this.app.redis.publish(`ws:rooms:${room}`, raw)
    } else {
      // Test: deliver directly
      this.deliverLocal(room, raw)
    }
  }

  private deliverLocal(room: string, raw: string) {
    const sockets = this.rooms.get(room)
    if (!sockets) return
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(raw)
      }
    }
  }

  roomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    rooms: RoomManager
  }
}
