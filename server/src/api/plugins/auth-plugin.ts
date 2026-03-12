import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import { config } from '../../config.js'

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  })

  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' })
    }
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { playerId: number; username: string }
    user: { playerId: number; username: string }
  }
}
