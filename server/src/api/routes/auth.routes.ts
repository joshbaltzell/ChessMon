import type { FastifyInstance } from 'fastify'
import { AuthService } from '../../services/auth.service.js'
import { getDb } from '../../db/connection.js'
import { registerSchema, loginSchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitAuth } from '../plugins/rate-limiter.js'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(getDb())

  app.post('/auth/register', { onRequest: [rateLimitAuth] }, async (request, reply) => {
    const { username, password } = parseOrThrow(registerSchema, request.body)

    try {
      const player = await authService.register(username, password)
      const token = app.jwt.sign({ playerId: player.id, username: player.username })
      return { token, player }
    } catch (err: any) {
      if (err.message === 'Username already taken') {
        return reply.status(409).send({ error: err.message, code: 'USERNAME_TAKEN' })
      }
      throw err
    }
  })

  app.post('/auth/login', { onRequest: [rateLimitAuth] }, async (request, reply) => {
    const { username, password } = parseOrThrow(loginSchema, request.body)

    try {
      const player = await authService.login(username, password)
      const token = app.jwt.sign({ playerId: player.id, username: player.username })
      return { token, player }
    } catch (err: any) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }
  })
}
