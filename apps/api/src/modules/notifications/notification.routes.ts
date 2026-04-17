import type { FastifyInstance } from 'fastify'
import { NotificationService } from './notification.service.js'
import { notificationEventSchema, updatePrefsSchema } from './notification.schema.js'

export async function notificationRoutes(app: FastifyInstance) {
  const svc = new NotificationService(app)

  // Start worker (no-op in test)
  svc.startWorker()

  // ── GET /notifications/prefs ───────────────────────────────────────────────
  app.get('/notifications/prefs', {
    onRequest: [app.authenticate],
    handler: async (request) => svc.getPrefs(request.user.userId),
  })

  // ── PATCH /notifications/prefs ─────────────────────────────────────────────
  app.patch('/notifications/prefs', {
    onRequest: [app.authenticate],
    handler: async (request) => {
      const body = updatePrefsSchema.parse(request.body)
      return svc.updatePrefs(request.user.userId, body)
    },
  })

  // ── GET /notifications/unsubscribe?token=... ───────────────────────────────
  // Public — no JWT required (email link)
  app.get<{ Querystring: { token: string } }>('/notifications/unsubscribe', {
    handler: async (request, reply) => {
      await svc.handleUnsubscribe(request.query.token)
      return reply.code(200).send({ message: 'You have been unsubscribed from all email notifications.' })
    },
  })

  // ── GET /notifications/templates/:event/preview ────────────────────────────
  app.get<{ Params: { event: string } }>('/notifications/templates/:event/preview', {
    onRequest: [app.authenticate],
    handler: async (request) => {
      const event = notificationEventSchema.parse(request.params.event)
      return svc.previewTemplate(event, request.user.organizationId)
    },
  })

  // ── GET /notifications — inbox ─────────────────────────────────────────────
  app.get('/notifications', {
    onRequest: [app.authenticate],
    handler: async (request) => {
      return app.prisma.notification.findMany({
        where: { recipientId: request.user.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    },
  })

  // ── PATCH /notifications/:id/read ─────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/notifications/:id/read', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const notif = await app.prisma.notification.findFirst({
        where: { id: request.params.id, recipientId: request.user.userId },
      })
      if (!notif) throw app.httpErrors.notFound('Notification not found')
      await app.prisma.notification.update({
        where: { id: request.params.id },
        data: { readAt: new Date() },
      })
      return reply.code(204).send()
    },
  })
}
