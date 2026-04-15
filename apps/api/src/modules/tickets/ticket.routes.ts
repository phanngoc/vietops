import type { FastifyInstance } from 'fastify'
import { TicketService } from './ticket.service.js'
import {
  createTicketSchema,
  updateTicketSchema,
  listTicketsSchema,
  createCommentSchema,
  updateCommentSchema,
} from './ticket.schema.js'

export async function ticketRoutes(app: FastifyInstance) {
  const svc = new TicketService(app)

  // All ticket routes require authentication
  app.addHook('onRequest', app.authenticate)

  // ── POST /tickets ──────────────────────────────────────────────────────────
  app.post('/', {
    handler: async (request, reply) => {
      const body = createTicketSchema.parse(request.body)
      const ticket = await svc.create(body, request.user)
      return reply.code(201).send(ticket)
    },
  })

  // ── GET /tickets ───────────────────────────────────────────────────────────
  app.get('/', {
    handler: async (request, reply) => {
      const query = listTicketsSchema.parse(request.query)
      const result = await svc.list(query, request.user)
      return reply.code(200).send(result)
    },
  })

  // ── GET /tickets/:id ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', {
    handler: async (request, reply) => {
      const ticket = await svc.getById(request.params.id, request.user)
      return reply.code(200).send(ticket)
    },
  })

  // ── PATCH /tickets/:id ─────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', {
    handler: async (request, reply) => {
      const body = updateTicketSchema.parse(request.body)
      const ticket = await svc.update(request.params.id, body, request.user)
      return reply.code(200).send(ticket)
    },
  })

  // ── POST /tickets/:id/comments ─────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/comments', {
    handler: async (request, reply) => {
      const body = createCommentSchema.parse(request.body)
      const comment = await svc.addComment(request.params.id, body, request.user)
      return reply.code(201).send(comment)
    },
  })

  // ── PATCH /tickets/:id/comments/:commentId ────────────────────────────────
  app.patch<{ Params: { id: string; commentId: string } }>('/:id/comments/:commentId', {
    handler: async (request, reply) => {
      const body = updateCommentSchema.parse(request.body)
      const comment = await svc.updateComment(
        request.params.id,
        request.params.commentId,
        body,
        request.user,
      )
      return reply.code(200).send(comment)
    },
  })

  // ── GET /tickets/:id/activities ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/activities', {
    handler: async (request, reply) => {
      const activities = await svc.getActivities(request.params.id, request.user)
      return reply.code(200).send(activities)
    },
  })
}
