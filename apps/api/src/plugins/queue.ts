import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'

export const SLA_QUEUE_NAME = 'sla-checks'
export const NOTIFICATION_QUEUE_NAME = 'notifications'

export interface SlaCheckJobData {
  ticketId: string
  slaRecordId: string
  checkPoint: 50 | 75 | 100
}

export type NotificationEvent =
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.updated'
  | 'ticket.resolved'
  | 'sla.warning'
  | 'sla.breached'

export interface NotificationJobData {
  event: NotificationEvent
  organizationId: string
  recipientId: string
  ticketId?: string
  /** Handlebars context passed to the template */
  context: Record<string, unknown>
}

declare module 'fastify' {
  interface FastifyInstance {
    slaQueue: Queue<SlaCheckJobData>
    notificationQueue: Queue<NotificationJobData>
    redis: Redis
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const redis = new Redis(fastify.config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const queueOpts = {
    connection: redis,
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
  }

  const slaQueue = new Queue<SlaCheckJobData>(SLA_QUEUE_NAME, queueOpts)
  const notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, queueOpts)

  fastify.decorate('redis', redis)
  fastify.decorate('slaQueue', slaQueue)
  fastify.decorate('notificationQueue', notificationQueue)

  fastify.addHook('onClose', async () => {
    await slaQueue.close()
    await notificationQueue.close()
    redis.disconnect()
  })
})
