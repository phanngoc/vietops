import type { FastifyInstance } from 'fastify'
import { AuthService } from './auth.service.js'
import {
  loginSchema,
  registerSchema,
  refreshSchema,
  inviteSchema,
  acceptInviteSchema,
} from './auth.schema.js'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app, app.config.REFRESH_TOKEN_EXPIRES_IN)
  const isTest = app.config.NODE_ENV === 'test'

  // POST /auth/login
  app.post('/login', {
    config: isTest ? {} : { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = loginSchema.parse(request.body)
      const result = await authService.login(body)
      return reply.code(200).send(result)
    },
  })

  // POST /auth/register
  app.post('/register', {
    config: isTest ? {} : { rateLimit: { max: 3, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = registerSchema.parse(request.body)
      const result = await authService.register(body)
      return reply.code(201).send(result)
    },
  })

  // POST /auth/refresh
  app.post('/refresh', {
    config: isTest ? {} : { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = refreshSchema.parse(request.body)
      const result = await authService.refresh(body.refreshToken)
      return reply.code(200).send(result)
    },
  })

  // POST /auth/logout
  app.post('/logout', {
    handler: async (request, reply) => {
      const body = refreshSchema.parse(request.body)
      await authService.logout(body.refreshToken)
      return reply.code(200).send({ message: 'Logged out successfully' })
    },
  })

  // POST /auth/invite (requires auth + admin/manager role)
  app.post('/invite', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const user = request.user as { role: string; organizationId: string }
      if (user.role !== 'admin' && user.role !== 'manager') {
        throw app.httpErrors.forbidden('Only admins and managers can invite users')
      }
      const body = inviteSchema.parse(request.body)
      const result = await authService.invite(body, user.organizationId)
      return reply.code(201).send(result)
    },
  })

  // POST /auth/accept-invite/:token
  app.post<{ Params: { token: string } }>('/accept-invite/:token', {
    config: isTest ? {} : { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = acceptInviteSchema.parse(request.body)
      const result = await authService.acceptInvite(request.params.token, body)
      return reply.code(200).send(result)
    },
  })
}
