import { eq, and } from 'drizzle-orm'
import { bots, dailyQuests } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { CardService } from './card.service.js'

export interface DailyQuest {
  id: number
  questType: string
  description: string
  targetCount: number
  currentCount: number
  completed: boolean
  rewardType: string
  rewardAmount: number
}

export interface StreakInfo {
  streak: number
  lastCheckIn: string | null
  reward: { type: string; amount: number } | null
}

// Quest templates by level range
interface QuestTemplate {
  type: string
  description: string
  target: number
  rewardType: string
  rewardAmount: number
  minLevel: number
}

const QUEST_POOL: QuestTemplate[] = [
  // Early game (L1-5)
  { type: 'win_spars', description: 'Win 2 spars', target: 2, rewardType: 'energy', rewardAmount: 2, minLevel: 1 },
  { type: 'play_cards', description: 'Play 3 cards', target: 3, rewardType: 'energy', rewardAmount: 2, minLevel: 1 },
  { type: 'earn_xp', description: 'Earn 50 XP', target: 50, rewardType: 'energy', rewardAmount: 3, minLevel: 1 },
  // Mid game (L3+)
  { type: 'use_prep_cards', description: 'Use 2 preparation cards', target: 2, rewardType: 'energy', rewardAmount: 3, minLevel: 3 },
  { type: 'beat_boss', description: 'Beat a ladder opponent', target: 1, rewardType: 'energy', rewardAmount: 4, minLevel: 3 },
  { type: 'win_streak', description: 'Win 3 spars in a row', target: 3, rewardType: 'energy', rewardAmount: 3, minLevel: 3 },
  // Late game (L6+)
  { type: 'gain_elo', description: 'Gain +20 Elo today', target: 20, rewardType: 'energy', rewardAmount: 4, minLevel: 6 },
  { type: 'play_cards', description: 'Play 5 cards', target: 5, rewardType: 'energy', rewardAmount: 3, minLevel: 6 },
]

const QUEST_DESCRIPTIONS: Record<string, (target: number) => string> = {
  win_spars: t => `Win ${t} spars`,
  play_cards: t => `Play ${t} cards`,
  earn_xp: t => `Earn ${t} XP`,
  use_prep_cards: t => `Use ${t} preparation cards`,
  beat_boss: t => `Beat ${t} ladder opponent${t > 1 ? 's' : ''}`,
  win_streak: t => `Win ${t} spars in a row`,
  gain_elo: t => `Gain +${t} Elo today`,
  pilot_win: t => `Win ${t} pilot game${t > 1 ? 's' : ''}`,
}

export class DailyQuestService {
  constructor(private db: DrizzleDb) {}

  /**
   * Get today's date as YYYY-MM-DD.
   */
  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  /**
   * Get or generate daily quests for a bot.
   */
  getDailyQuests(botId: number): DailyQuest[] {
    const date = this.today()

    const existing = this.db.select().from(dailyQuests)
      .where(and(eq(dailyQuests.botId, botId), eq(dailyQuests.date, date)))
      .all()

    if (existing.length > 0) {
      return existing.map(q => ({
        id: q.id,
        questType: q.questType,
        description: QUEST_DESCRIPTIONS[q.questType]?.(q.targetCount) || q.questType,
        targetCount: q.targetCount,
        currentCount: q.currentCount,
        completed: q.completed === 1,
        rewardType: q.rewardType,
        rewardAmount: q.rewardAmount,
      }))
    }

    return this.generateDailyQuests(botId)
  }

  /**
   * Generate 3 daily quests for a bot.
   */
  private generateDailyQuests(botId: number): DailyQuest[] {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return []

    const date = this.today()
    const available = QUEST_POOL.filter(q => q.minLevel <= bot.level)

    // Pick 3 unique quest types
    const shuffled = [...available].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, 3)

    const quests: DailyQuest[] = []
    for (const template of selected) {
      const row = this.db.insert(dailyQuests).values({
        botId,
        date,
        questType: template.type,
        targetCount: template.target,
        currentCount: 0,
        completed: 0,
        rewardType: template.rewardType,
        rewardAmount: template.rewardAmount,
      }).returning().get()

      quests.push({
        id: row.id,
        questType: template.type,
        description: QUEST_DESCRIPTIONS[template.type]?.(template.target) || template.type,
        targetCount: template.target,
        currentCount: 0,
        completed: false,
        rewardType: template.rewardType,
        rewardAmount: template.rewardAmount,
      })
    }

    return quests
  }

  /**
   * Increment progress on a quest type for a bot.
   * Returns any rewards earned from quest completion.
   */
  incrementQuest(botId: number, questType: string, amount: number = 1): { completed: boolean; reward?: { type: string; amount: number } } | null {
    const date = this.today()

    const quest = this.db.select().from(dailyQuests)
      .where(and(
        eq(dailyQuests.botId, botId),
        eq(dailyQuests.date, date),
        eq(dailyQuests.questType, questType),
      ))
      .get()

    if (!quest || quest.completed === 1) return null

    const newCount = quest.currentCount + amount
    const nowComplete = newCount >= quest.targetCount

    this.db.update(dailyQuests)
      .set({
        currentCount: newCount,
        completed: nowComplete ? 1 : 0,
      })
      .where(eq(dailyQuests.id, quest.id))
      .run()

    if (nowComplete) {
      // Grant reward
      if (quest.rewardType === 'energy') {
        const cardService = new CardService(this.db)
        cardService.addEnergy(botId, quest.rewardAmount)
      }

      return {
        completed: true,
        reward: { type: quest.rewardType, amount: quest.rewardAmount },
      }
    }

    return { completed: false }
  }

  /**
   * Process daily check-in streak for a bot.
   */
  getStreakInfo(botId: number): StreakInfo {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return { streak: 0, lastCheckIn: null, reward: null }

    const today = this.today()
    const lastCheckIn = bot.lastCheckInDate

    if (lastCheckIn === today) {
      // Already checked in today
      return {
        streak: bot.dailyCheckInStreak,
        lastCheckIn,
        reward: null,
      }
    }

    // Check if yesterday was the last check-in (streak continues)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    let newStreak: number

    if (lastCheckIn === yesterday) {
      newStreak = bot.dailyCheckInStreak + 1
    } else {
      // Streak broken
      newStreak = 1
    }

    // Update check-in
    this.db.update(bots)
      .set({
        dailyCheckInStreak: newStreak,
        lastCheckInDate: today,
      })
      .where(eq(bots.id, botId))
      .run()

    // Calculate streak reward
    let reward: { type: string; amount: number } | null = null
    if (newStreak >= 6) {
      reward = { type: 'energy', amount: 5 }
    } else if (newStreak >= 3) {
      reward = { type: 'energy', amount: 3 }
    } else {
      reward = { type: 'energy', amount: 2 }
    }

    // Grant streak reward energy
    if (reward) {
      const cardService = new CardService(this.db)
      cardService.addEnergy(botId, reward.amount)
    }

    return {
      streak: newStreak,
      lastCheckIn: today,
      reward,
    }
  }
}
