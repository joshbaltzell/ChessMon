import { describe, it, expect, beforeAll } from 'vitest'
import { initializeDb, getDb } from '../../src/db/connection.js'
import { BotService } from '../../src/services/bot.service.js'
import { AuthService } from '../../src/services/auth.service.js'
import { DashboardService } from '../../src/services/dashboard.service.js'
import type { AlignmentAttack, AlignmentStyle } from '../../src/types/index.js'

const uid = () => Math.random().toString(36).slice(2, 10)

describe('Bot Dashboard', () => {
  beforeAll(() => {
    process.env.DB_PATH = ':memory:'
    initializeDb(':memory:')
  })

  it('should return a comprehensive dashboard for a new bot', async () => {
    const db = getDb()
    const authService = new AuthService(db)
    const botService = new BotService(db)
    const dashboardService = new DashboardService(db)

    const player = await authService.register(`dash_${uid()}`, 'password123')
    const bot = botService.create({
      playerId: player.id,
      name: `DashBot_${uid()}`,
      aggression: 18, positional: 5, tactical: 15, endgame: 5, creativity: 7,
      alignmentAttack: 'aggressive' as AlignmentAttack,
      alignmentStyle: 'sacrificial' as AlignmentStyle,
    })

    const dashboard = await dashboardService.getBotDashboard(bot.id)

    // Identity
    expect(dashboard.identity.name).toBe(bot.name)
    expect(dashboard.identity.catchphrase).toBeTruthy()
    expect(dashboard.identity.alignmentAttack).toBe('aggressive')
    expect(dashboard.identity.alignmentStyle).toBe('sacrificial')

    // Stats
    expect(dashboard.stats.level).toBe(1)
    expect(dashboard.stats.elo).toBe(400)
    expect(dashboard.stats.gamesPlayed).toBe(0)
    expect(dashboard.stats.record).toEqual({ wins: 0, losses: 0, draws: 0 })

    // Attributes
    expect(dashboard.attributes.aggression).toBe(18)
    expect(dashboard.attributes.dominant).toBe('aggression')

    // Training
    expect(dashboard.training.pointsRemaining).toBe(10)
    expect(dashboard.training.recentLog).toHaveLength(0)

    // Tactics
    expect(dashboard.tactics).toHaveLength(0)

    // Appearance
    expect(dashboard.appearance.asciiTier).toBe(1)
    expect(dashboard.appearance.asciiArt).toBeTruthy()
    expect(dashboard.appearance.availableSkins.length).toBeGreaterThan(0)

    // Mood
    expect(dashboard.mood).toBeTruthy()
    expect(dashboard.mood.face).toBeTruthy()
    expect(dashboard.mood.message).toBeTruthy()

    // Recent games
    expect(dashboard.recentGames).toHaveLength(0)

    // Next challenge
    expect(dashboard.nextChallenge).toBeTruthy()

    // Learned style (null for a new bot with no ML model)
    expect(dashboard.learnedStyle).toBeNull()
  })

  it('should identify dominant attribute correctly', async () => {
    const db = getDb()
    const authService = new AuthService(db)
    const botService = new BotService(db)
    const dashboardService = new DashboardService(db)

    const player = await authService.register(`attr_${uid()}`, 'password123')

    // Balanced build
    const balanced = botService.create({
      playerId: player.id,
      name: `Balanced_${uid()}`,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })
    const balancedDash = await dashboardService.getBotDashboard(balanced.id)
    expect(balancedDash.attributes.dominant).toBe('balanced')

    // Endgame focused
    const endgamer = botService.create({
      playerId: player.id,
      name: `Endgame_${uid()}`,
      aggression: 5, positional: 5, tactical: 5, endgame: 20, creativity: 15,
      alignmentAttack: 'defensive' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })
    const endgamerDash = await dashboardService.getBotDashboard(endgamer.id)
    expect(endgamerDash.attributes.dominant).toBe('endgame')
  })

  it('should throw for non-existent bot', async () => {
    const db = getDb()
    const dashboardService = new DashboardService(db)

    await expect(dashboardService.getBotDashboard(99999)).rejects.toThrow('Bot not found')
  })
})
