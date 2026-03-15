import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { players } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'

export class AuthService {
  constructor(private db: DrizzleDb) {}

  async register(username: string, password: string) {
    const existing = this.db.select().from(players).where(eq(players.username, username)).get()
    if (existing) {
      throw new Error('Username already taken')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const result = this.db.insert(players).values({
      username,
      passwordHash,
    }).returning().get()

    return { id: result.id, username: result.username }
  }

  async login(username: string, password: string) {
    const player = this.db.select().from(players).where(eq(players.username, username)).get()
    if (!player) {
      throw new Error('Invalid credentials')
    }

    const valid = await bcrypt.compare(password, player.passwordHash)
    if (!valid) {
      throw new Error('Invalid credentials')
    }

    return { id: player.id, username: player.username }
  }
}
