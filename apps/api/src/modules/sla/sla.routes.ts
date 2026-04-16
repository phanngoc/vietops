import type { FastifyInstance } from 'fastify'
import { Worker } from 'bullmq'
import { SlaService } from './sla.service.js'
import { createSlaPolicySchema, updateSlaPolicySchema } from './sla.schema.js'
import { SLA_QUEUE_NAME, type SlaCheckJobData } from '../../plugins/queue.js'

export async function slaRoutes(app: FastifyInstance) {
  const svc = new SlaService(app)

  // ── Start BullMQ worker (skip in test to avoid hanging connections) ─────────
  let worker: Worker | undefined
  if (app.config.NODE_ENV !== 'test') {
    worker = new Worker<SlaCheckJobData>(
      SLA_QUEUE_NAME,
      async (job) => {
        await svc.processBreachCheck(job.data.slaRecordId)
      },
      {
        connection: app.redis,
        concurrency: 5,
      },
    )
    app.addHook('onClose', async () => {
      await worker?.close()
    })
  }

  // ── GET /sla-policies ──────────────────────────────────────────────────────
  app.get('/sla-policies', {
    onRequest: [app.authenticate],
    handler: async (request) => {
      return svc.listPolicies(request.user.organizationId)
    },
  })

  // ── POST /sla-policies ─────────────────────────────────────────────────────
  app.post('/sla-policies', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const body = createSlaPolicySchema.parse(request.body)
      const policy = await svc.createPolicy(body, request.user.organizationId)
      return reply.code(201).send(policy)
    },
  })

  // ── PATCH /sla-policies/:id ────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/sla-policies/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const body = updateSlaPolicySchema.parse(request.body)
      const policy = await svc.updatePolicy(request.params.id, body, request.user.organizationId)
      return reply.code(200).send(policy)
    },
  })

  // ── DELETE /sla-policies/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/sla-policies/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      await svc.deletePolicy(request.params.id, request.user.organizationId)
      return reply.code(204).send()
    },
  })

  // ── GET /tickets/:id/sla ───────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/tickets/:id/sla', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const result = await svc.getTicketSla(request.params.id, request.user)
      return reply.code(200).send(result)
    },
  })
}
