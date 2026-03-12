import type { FastifyInstance } from 'fastify'
import { AuthService } from '../../services/auth.service.js'
import { getDb } from '../../db/connection.js'

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(getDb())

  app.post('/auth/register', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string }

    if (!username || username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return reply.status(400).send({ error: 'Username must be 3-20 alphanumeric characters or underscores', code: 'INVALID_USERNAME' })
    }
    if (!password || password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters', code: 'INVALID_PASSWORD' })
    }

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

  app.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string }

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required', code: 'MISSING_FIELDS' })
    }

    try {
      const player = await authService.login(username, password)
      const token = app.jwt.sign({ playerId: player.id, username: player.username })
      return { token, player }
    } catch (err: any) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }
  })
}
