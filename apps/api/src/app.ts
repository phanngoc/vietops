import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import type { Env } from './config.js'
import prismaPlugin from './plugins/prisma.js'
import queuePlugin from './plugins/queue.js'
import mailerPlugin from './plugins/mailer.js'
import wsPlugin from './plugins/websocket.js'
import authPlugin from './plugins/auth.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { ticketRoutes } from './modules/tickets/ticket.routes.js'
import { slaRoutes } from './modules/sla/sla.routes.js'
import { emailRoutes } from './modules/email/email.routes.js'
import { realtimeRoutes } from './modules/realtime/realtime.routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: Env
  }
}

export async function buildApp(config: Env) {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production' && config.NODE_ENV !== 'test'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // Decorate with config
  app.decorate('config', config)

  // Error handler for Zod validation errors
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        statusCode: 400,
        issues: JSON.parse(error.message),
      })
    }
    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
      })
    }
    app.log.error(error)
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
    })
  })

  // Plugins
  await app.register(sensible)
  await app.register(helmet)
  await app.register(cors, { origin: config.APP_URL, credentials: true })
  await app.register(rateLimit, {
    max: config.NODE_ENV === 'test' ? 1000 : 100,
    timeWindow: '1 minute',
  })
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  })

  // Database
  await app.register(prismaPlugin)

  // Queue (BullMQ)
  await app.register(queuePlugin)

  // Mailer (no-op in test env)
  await app.register(mailerPlugin)

  // WebSocket + RoomManager
  await app.register(wsPlugin)

  // Auth middleware
  await app.register(authPlugin)

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(ticketRoutes, { prefix: '/tickets' })
  await app.register(slaRoutes)
  await app.register(emailRoutes)
  await app.register(realtimeRoutes)

  return app
}
