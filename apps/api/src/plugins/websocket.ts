import fp from 'fastify-plugin'
import wsPlugin from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import { RoomManager } from '../modules/realtime/realtime.service.js'

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(wsPlugin)

  const rooms = new RoomManager(fastify)
  await rooms.start()

  fastify.decorate('rooms', rooms)

  fastify.addHook('onClose', async () => {
    await rooms.stop()
  })
})
