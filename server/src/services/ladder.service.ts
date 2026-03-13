import { eq, and } from 'drizzle-orm'
import { bots, ladderProgress } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const rawData = require('../data/system-bots.json') as {
  systemBots: Array<{ level: number; name: string; elo: number; description?: string }>
}
const systemBotsData = rawData.systemBots

export interface LadderOpponent {
  index: number
  name: string
  level: number
  elo: number
  defeated: boolean
  gameRecordId: number | null
}

export interface LadderState {
  targetLevel: number
  opponents: LadderOpponent[]
  allDefeated: boolean
  currentOpponentIndex: number
}

export class LadderService {
  constructor(private db: DrizzleDb) {}

  /**
   * Get or initialize ladder state for a bot.
   */
  getLadderState(botId: number): LadderState | null {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return null

    const targetLevel = bot.level + 1
    if (targetLevel > 20) return null

    // Check for existing ladder at this target level
    const existing = this.db.select().from(ladderProgress)
      .where(and(
        eq(ladderProgress.botId, botId),
        eq(ladderProgress.targetLevel, targetLevel),
      ))
      .all()

    if (existing.length === 0) {
      // Auto-initialize ladder
      return this.initLadder(botId)
    }

    const opponents: LadderOpponent[] = existing
      .sort((a, b) => a.opponentIndex - b.opponentIndex)
      .map(row => ({
        index: row.opponentIndex,
        name: row.opponentName,
        level: row.opponentLevel,
        elo: this.getSystemBotElo(row.opponentLevel),
        defeated: row.defeated === 1,
        gameRecordId: row.gameRecordId,
      }))

    const allDefeated = opponents.every(o => o.defeated)
    const currentOpponentIndex = opponents.findIndex(o => !o.defeated)

    return {
      targetLevel,
      opponents,
      allDefeated,
      currentOpponentIndex: currentOpponentIndex === -1 ? opponents.length : currentOpponentIndex,
    }
  }

  /**
   * Initialize a ladder for the bot's next level.
   * 3 opponents: level-1 (warm-up), current level, target level (gatekeeper).
   */
  initLadder(botId: number): LadderState | null {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return null

    const targetLevel = bot.level + 1
    if (targetLevel > 20) return null

    // Clear any existing ladder for this target
    this.db.delete(ladderProgress)
      .where(and(
        eq(ladderProgress.botId, botId),
        eq(ladderProgress.targetLevel, targetLevel),
      ))
      .run()

    // Create 3 opponents
    const opponentLevels = [
      Math.max(1, bot.level - 1), // warm-up
      bot.level,                   // even match
      targetLevel,                 // gatekeeper
    ]

    const opponents: LadderOpponent[] = opponentLevels.map((lvl, i) => {
      const sysBot = this.getSystemBot(lvl)
      const name = sysBot?.name || `Level ${lvl} Bot`

      this.db.insert(ladderProgress).values({
        botId,
        targetLevel,
        opponentIndex: i,
        opponentName: name,
        opponentLevel: lvl,
        defeated: 0,
      }).run()

      return {
        index: i,
        name,
        level: lvl,
        elo: this.getSystemBotElo(lvl),
        defeated: false,
        gameRecordId: null,
      }
    })

    return {
      targetLevel,
      opponents,
      allDefeated: false,
      currentOpponentIndex: 0,
    }
  }

  /**
   * Mark a ladder opponent as defeated.
   */
  defeatOpponent(botId: number, opponentIndex: number, gameRecordId: number): void {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return

    const targetLevel = bot.level + 1

    this.db.update(ladderProgress)
      .set({ defeated: 1, gameRecordId })
      .where(and(
        eq(ladderProgress.botId, botId),
        eq(ladderProgress.targetLevel, targetLevel),
        eq(ladderProgress.opponentIndex, opponentIndex),
      ))
      .run()
  }

  /**
   * Check if ladder is complete (all 3 opponents defeated).
   */
  isLadderComplete(botId: number): boolean {
    const state = this.getLadderState(botId)
    return state?.allDefeated ?? false
  }

  /**
   * Reset ladder for a new target level (after level-up).
   */
  resetLadder(botId: number, newTargetLevel: number): void {
    // Delete all ladder entries for this bot at the old target
    this.db.delete(ladderProgress)
      .where(eq(ladderProgress.botId, botId))
      .run()
  }

  /**
   * Get the opponent level for the next undefeated ladder opponent.
   */
  getNextOpponentLevel(botId: number): number | null {
    const state = this.getLadderState(botId)
    if (!state || state.allDefeated) return null
    const next = state.opponents.find(o => !o.defeated)
    return next?.level ?? null
  }

  private getSystemBot(level: number) {
    return systemBotsData.find(b => b.level === level) || null
  }

  private getSystemBotElo(level: number): number {
    const bot = systemBotsData.find(b => b.level === level)
    return bot?.elo || (300 + level * 100)
  }
}
