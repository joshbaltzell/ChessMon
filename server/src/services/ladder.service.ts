import { eq, and } from 'drizzle-orm'
import { bots, ladderProgress } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { PlayParameters } from '../types/index.js'
import { systemBotPlayParameters } from '../models/bot-intelligence.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

interface SystemBotData {
  level: number
  name: string
  elo: number
  description?: string
  weakness?: string
  scoutText?: string
  playStyleHint?: string
  specialAbility?: { name: string; description: string; effect: string; value: number }
  counterPrep?: string
}

const rawData = require('../data/system-bots.json') as { systemBots: SystemBotData[] }
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

  /**
   * Get scout info about the next undefeated ladder opponent.
   * Includes special ability and counter-prep suggestion.
   */
  getScoutInfo(botId: number): {
    name: string; level: number; weakness: string; scoutText: string; playStyleHint: string;
    specialAbility?: { name: string; description: string }; counterPrep?: string;
  } | null {
    const ladder = this.getLadderState(botId)
    if (!ladder) return null
    const nextOpp = ladder.opponents.find(o => !o.defeated)
    if (!nextOpp) return null
    const systemBot = this.getSystemBot(nextOpp.level)
    return {
      name: nextOpp.name,
      level: nextOpp.level,
      weakness: systemBot?.weakness || 'No known weakness',
      scoutText: systemBot?.scoutText || 'No intel available.',
      playStyleHint: systemBot?.playStyleHint || 'Unknown play style.',
      specialAbility: systemBot?.specialAbility
        ? { name: systemBot.specialAbility.name, description: systemBot.specialAbility.description }
        : undefined,
      counterPrep: systemBot?.counterPrep,
    }
  }

  /**
   * Get enhanced PlayParameters for a boss fight, applying the boss's special ability.
   */
  getBossPlayParameters(level: number): PlayParameters {
    const baseParams = systemBotPlayParameters(level)
    const systemBot = this.getSystemBot(level)
    if (!systemBot?.specialAbility) return baseParams

    const ability = systemBot.specialAbility
    const params = { ...baseParams }

    switch (ability.effect) {
      case 'depthBonus':
        params.searchDepth = Math.min(params.searchDepth + ability.value, 22)
        break
      case 'blunderReduction':
        params.blunderRate *= ability.value
        break
      case 'aggressionBoost':
        params.aggressionWeight += ability.value
        break
      case 'positionalBoost':
        params.positionalWeight += ability.value
        break
      case 'tacticalBoost':
        params.tacticalWeight += ability.value
        break
      case 'endgameBoost':
        params.endgameWeight += ability.value
        break
      case 'multiPvBoost':
        params.multiPv = Math.max(params.multiPv, ability.value)
        break
    }

    return params
  }

  /**
   * Returns training suggestion based on the current ladder opponent's weakness.
   * Used for boss loss feedback UI.
   */
  getBossLossAdvice(botId: number): { weakness: string; suggestedCard: string; suggestedAction: string } | null {
    const scoutInfo = this.getScoutInfo(botId)
    if (!scoutInfo) return null
    const suggestion = this.mapWeaknessToCard(scoutInfo.weakness)
    return {
      weakness: scoutInfo.weakness,
      suggestedCard: suggestion.card,
      suggestedAction: suggestion.action,
    }
  }

  private mapWeaknessToCard(weakness: string): { card: string; action: string } {
    const w = weakness.toLowerCase()
    if (w.includes('opening') || w.includes('diagonal')) return { card: 'Opening Prep', action: 'Queue Opening Prep before the fight' }
    if (w.includes('endgame') || w.includes('simplif')) return { card: 'Aggression Surge', action: 'Play Aggression Surge to win before endgame' }
    if (w.includes('tactical') || w.includes('fork') || w.includes('pin') || w.includes('sharp'))
      return { card: 'Tactical Focus', action: 'Queue Tactical Focus to out-tactic the boss' }
    if (w.includes('aggress') || w.includes('attack') || w.includes('flank'))
      return { card: 'Aggression Surge', action: 'Play Aggression Surge for aggressive play' }
    if (w.includes('solid') || w.includes('defen') || w.includes('prophylax'))
      return { card: 'Iron Defense', action: 'Queue Iron Defense and play solid' }
    return { card: 'Sharpen', action: 'Queue Sharpen for deeper calculation' }
  }

  private getSystemBot(level: number) {
    return systemBotsData.find(b => b.level === level) || null
  }

  private getSystemBotElo(level: number): number {
    const bot = systemBotsData.find(b => b.level === level)
    return bot?.elo || (300 + level * 100)
  }
}
