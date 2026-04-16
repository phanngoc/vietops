import type { FastifyInstance } from 'fastify'
import { EmailService } from './email.service.js'
import { inboundEmailSchema } from './email.schema.js'

export async function emailRoutes(app: FastifyInstance) {
  const svc = new EmailService(app)

  /**
   * POST /webhooks/email/:orgId
   *
   * Accepts SendGrid Inbound Parse (multipart/form-data) or
   * application/json payloads with the same fields.
   *
   * No JWT auth — protected by org-scoped URL + optional webhook secret header.
   */
  app.post<{ Params: { orgId: string } }>('/webhooks/email/:orgId', {
    handler: async (request, reply) => {
      // Optional shared-secret verification
      const secret = app.config.EMAIL_WEBHOOK_SECRET
      if (secret) {
        const provided = request.headers['x-webhook-secret']
        if (provided !== secret) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid webhook secret', statusCode: 401 })
        }
      }

      const body = inboundEmailSchema.parse(request.body)
      const ticket = await svc.ingest(body, request.params.orgId)
      return reply.code(201).send(ticket)
    },
  })
}
