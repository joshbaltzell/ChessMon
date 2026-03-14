import type { DrizzleDb } from '../db/connection.js'
import type { LootResult } from '../types/index.js'
import { CardService } from './card.service.js'
import { LadderService } from './ladder.service.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const insightsData = require('../data/insights.json') as {
  insights: Record<string, string[]>
}

export class LootService {
  private cardService: CardService
  private ladderService: LadderService

  constructor(private db: DrizzleDb) {
    this.cardService = new CardService(db)
    this.ladderService = new LadderService(db)
  }

  rollLoot(botId: number, botLevel: number): LootResult {
    const roll = Math.random()
    if (roll < 0.50) return { type: 'none', data: null }
    if (roll < 0.70) return this.rollInsight(botLevel)
    if (roll < 0.85) return { type: 'energy', data: { amount: 1 } }
    if (roll < 0.95) return this.rollCardDrop(botId, botLevel)
    return this.rollBossIntel(botId)
  }

  private rollInsight(level: number): LootResult {
    const effectiveLevel = Math.min(Math.max(level, 1), 5)
    const pool = insightsData.insights[String(effectiveLevel)] || insightsData.insights['1']
    const text = pool[Math.floor(Math.random() * pool.length)]
    return { type: 'insight', data: { text } }
  }

  private rollCardDrop(botId: number, botLevel: number): LootResult {
    const handState = this.cardService.getHandState(botId)
    if (handState.cards.length >= 10) {
      return { type: 'energy', data: { amount: 1 } }
    }
    const cards = this.cardService.randomDrawFiltered(1, botLevel)
    if (cards.length === 0) return { type: 'energy', data: { amount: 1 } }
    const added = this.cardService.addCardToHand(botId, cards[0])
    if (!added) return { type: 'energy', data: { amount: 1 } }
    return { type: 'card', data: { card: cards[0] } }
  }

  private rollBossIntel(botId: number): LootResult {
    try {
      const ladderState = this.ladderService.getLadderState(botId)
      if (!ladderState || ladderState.allDefeated) {
        return { type: 'energy', data: { amount: 1 } }
      }
      const nextOpponent = ladderState.opponents.find(o => !o.defeated)
      if (!nextOpponent) {
        return { type: 'energy', data: { amount: 1 } }
      }
      return {
        type: 'intel',
        data: {
          opponentName: nextOpponent.name,
          opponentLevel: nextOpponent.level,
          opponentElo: nextOpponent.elo,
        },
      }
    } catch {
      return { type: 'energy', data: { amount: 1 } }
    }
  }
}
