import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'

export const SLA_QUEUE_NAME = 'sla-checks'

export interface SlaCheckJobData {
  ticketId: string
  slaRecordId: string
  checkPoint: 50 | 75 | 100
}

declare module 'fastify' {
  interface FastifyInstance {
    slaQueue: Queue<SlaCheckJobData>
    redis: Redis
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const redis = new Redis(fastify.config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const slaQueue = new Queue<SlaCheckJobData>(SLA_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  })

  fastify.decorate('redis', redis)
  fastify.decorate('slaQueue', slaQueue)

  fastify.addHook('onClose', async () => {
    await slaQueue.close()
    redis.disconnect()
  })
})
