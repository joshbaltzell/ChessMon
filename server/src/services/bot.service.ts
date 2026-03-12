import { eq, desc } from 'drizzle-orm'
import { bots, botTactics } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { AlignmentAttack, AlignmentStyle } from '../types/index.js'
import { ATTRIBUTE_TOTAL, ATTRIBUTE_MIN, ATTRIBUTE_MAX } from '../types/index.js'

export interface CreateBotInput {
  playerId: number
  name: string
  aggression: number
  positional: number
  tactical: number
  endgame: number
  creativity: number
  alignmentAttack: AlignmentAttack
  alignmentStyle: AlignmentStyle
}

export class BotService {
  constructor(private db: DrizzleDb) {}

  validateAttributes(input: CreateBotInput): string | null {
    const attrs = [input.aggression, input.positional, input.tactical, input.endgame, input.creativity]

    for (const val of attrs) {
      if (!Number.isInteger(val) || val < ATTRIBUTE_MIN || val > ATTRIBUTE_MAX) {
        return `Each attribute must be an integer between ${ATTRIBUTE_MIN} and ${ATTRIBUTE_MAX}`
      }
    }

    const sum = attrs.reduce((a, b) => a + b, 0)
    if (sum !== ATTRIBUTE_TOTAL) {
      return `Attributes must sum to ${ATTRIBUTE_TOTAL}, got ${sum}`
    }

    const validAttacks: AlignmentAttack[] = ['aggressive', 'balanced', 'defensive']
    const validStyles: AlignmentStyle[] = ['chaotic', 'positional', 'sacrificial']

    if (!validAttacks.includes(input.alignmentAttack)) {
      return `alignment_attack must be one of: ${validAttacks.join(', ')}`
    }
    if (!validStyles.includes(input.alignmentStyle)) {
      return `alignment_style must be one of: ${validStyles.join(', ')}`
    }

    if (!input.name || input.name.length < 2 || input.name.length > 30) {
      return 'Bot name must be 2-30 characters'
    }

    return null
  }

  create(input: CreateBotInput) {
    const existing = this.db.select().from(bots).where(eq(bots.playerId, input.playerId)).get()
    if (existing) {
      throw new Error('Player already has a bot')
    }

    const nameExists = this.db.select().from(bots).where(eq(bots.name, input.name)).get()
    if (nameExists) {
      throw new Error('Bot name already taken')
    }

    return this.db.insert(bots).values({
      playerId: input.playerId,
      name: input.name,
      aggression: input.aggression,
      positional: input.positional,
      tactical: input.tactical,
      endgame: input.endgame,
      creativity: input.creativity,
      alignmentAttack: input.alignmentAttack,
      alignmentStyle: input.alignmentStyle,
    }).returning().get()
  }

  getById(id: number) {
    return this.db.select().from(bots).where(eq(bots.id, id)).get()
  }

  getByPlayerId(playerId: number) {
    return this.db.select().from(bots).where(eq(bots.playerId, playerId)).get()
  }

  getLeaderboard(limit = 20, offset = 0) {
    return this.db.select({
      id: bots.id,
      name: bots.name,
      level: bots.level,
      elo: bots.elo,
      gamesPlayed: bots.gamesPlayed,
      alignmentAttack: bots.alignmentAttack,
      alignmentStyle: bots.alignmentStyle,
      asciiTier: bots.asciiTier,
    })
      .from(bots)
      .orderBy(desc(bots.level), desc(bots.elo))
      .limit(limit)
      .offset(offset)
      .all()
  }

  getTactics(botId: number) {
    return this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
  }
}
