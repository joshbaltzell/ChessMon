import { eq } from 'drizzle-orm'
import { bots } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { calculateEloChange } from '../models/elo.js'

export interface AutoFightResult {
  opponent: string
  opponentLevel: number
  result: 'win' | 'loss' | 'draw'
  eloChange: number
  xpGained: number
}

export interface AbsenceReport {
  hoursAway: number
  fights: AutoFightResult[]
  totalEloChange: number
  totalXpGained: number
  streak: number
}

const MAX_AUTO_FIGHTS_PER_DAY = 8
const FIGHT_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const AUTO_XP_PER_FIGHT = 8 // ~30% of active play

/**
 * Process a bot's autonomous fights while the player was away.
 * Calculated on return — not a real background process.
 */
export function processAbsence(db: DrizzleDb, botId: number): AbsenceReport | null {
  const bot = db.select().from(bots).where(eq(bots.id, botId)).get()
  if (!bot) return null

  const now = Date.now()
  const lastActivity = bot.lastActivityAt ? new Date(bot.lastActivityAt).getTime() : 0

  // No absence if last activity was < 30 min ago
  const absenceMs = now - (lastActivity || now)
  if (absenceMs < FIGHT_INTERVAL_MS) {
    // Just update lastActivityAt
    db.update(bots)
      .set({ lastActivityAt: new Date() })
      .where(eq(bots.id, botId))
      .run()
    return null
  }

  const hoursAway = Math.floor(absenceMs / (60 * 60 * 1000))
  const possibleFights = Math.floor(absenceMs / FIGHT_INTERVAL_MS)
  const numFights = Math.min(possibleFights, MAX_AUTO_FIGHTS_PER_DAY)

  if (numFights === 0) {
    db.update(bots)
      .set({ lastActivityAt: new Date() })
      .where(eq(bots.id, botId))
      .run()
    return null
  }

  // Simulate lightweight fights
  const fights: AutoFightResult[] = []
  let currentElo = bot.elo
  let totalEloChange = 0
  let totalXpGained = 0

  // Opponent is close to bot's level (±1)
  const baseOpponentLevel = Math.max(1, Math.min(20, bot.level))

  for (let i = 0; i < numFights; i++) {
    // Vary opponent level slightly
    const oppLevel = Math.max(1, Math.min(20, baseOpponentLevel + (Math.random() < 0.3 ? 1 : Math.random() < 0.3 ? -1 : 0)))
    const oppElo = oppLevel * 100 + 300

    // Simulate outcome based on Elo difference + randomness
    const eloDiff = currentElo - oppElo
    const winProb = 1 / (1 + Math.pow(10, -eloDiff / 400))
    const roll = Math.random()

    let result: 'win' | 'loss' | 'draw'
    if (roll < winProb * 0.85) result = 'win'
    else if (roll < winProb * 0.85 + 0.1) result = 'draw'
    else result = 'loss'

    // Elo swing: ±10-15
    const gameResult = result === 'win' ? '1-0' : result === 'loss' ? '0-1' : '1/2-1/2'
    const eloChange = calculateEloChange(currentElo, oppElo, gameResult as any, true)

    currentElo = Math.max(100, currentElo + eloChange)
    totalEloChange += eloChange
    totalXpGained += AUTO_XP_PER_FIGHT

    const oppName = getOpponentName(oppLevel)

    fights.push({
      opponent: oppName,
      opponentLevel: oppLevel,
      result,
      eloChange,
      xpGained: AUTO_XP_PER_FIGHT,
    })
  }

  // Update bot stats
  db.update(bots)
    .set({
      elo: Math.max(100, bot.elo + totalEloChange),
      xp: bot.xp + totalXpGained,
      gamesPlayed: bot.gamesPlayed + numFights,
      lastActivityAt: new Date(),
      autoFightResultsJson: JSON.stringify(fights),
    })
    .where(eq(bots.id, botId))
    .run()

  return {
    hoursAway,
    fights,
    totalEloChange,
    totalXpGained,
    streak: fights.filter(f => f.result === 'win').length,
  }
}

// Simple opponent name lookup
const OPPONENT_NAMES: Record<number, string> = {
  1: 'Pawn Pusher', 2: 'Knight Hopper', 3: 'Bishop Slider', 4: 'Rook Roller',
  5: 'Castle Guard', 6: 'Pin Master', 7: 'Fork Finder', 8: 'Center Controller',
  9: 'File Opener', 10: 'Endgame Grinder', 11: 'Tempo Hunter', 12: 'Space Invader',
  13: 'Quiet Assassin', 14: 'Exchange Master', 15: 'Prophylaxis Pro', 16: 'Calculation Engine',
  17: 'Positional Sage', 18: 'Tactical Storm', 19: 'Grandmaster Ghost', 20: 'Stockfish Ceiling',
}

function getOpponentName(level: number): string {
  return OPPONENT_NAMES[level] || `Level ${level} Bot`
}
