import type { FastifyInstance } from 'fastify'
import { getAllOpenings } from '../../engine/opening-book.js'
import { getGameGuide, getOnboardingGuide } from '../../models/game-guide.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const tacticsData = require('../../data/tactics.json') as { tactics: Array<{ key: string; name: string; description: string; category: string; minLevel: number; cost: number }> }
const systemBotsData = require('../../data/system-bots.json') as { systemBots: Array<{ level: number; name: string; description: string; elo: number }> }
const cosmeticsData = require('../../data/cosmetics.json') as Record<string, unknown>

export async function catalogRoutes(app: FastifyInstance) {
  // Public endpoints - no auth required

  app.get('/catalog/tactics', async () => {
    return tacticsData.tactics
  })

  app.get('/catalog/alignments', async () => {
    return {
      attack: [
        { key: 'aggressive', name: 'Aggressive', description: 'Prefers attacking play, captures, and king-side assaults' },
        { key: 'balanced', name: 'Balanced', description: 'Flexible approach, adapts to the position' },
        { key: 'defensive', name: 'Defensive', description: 'Builds fortress positions, grinds in endgames' },
      ],
      style: [
        { key: 'chaotic', name: 'Chaotic', description: 'Unpredictable, high creativity bonus' },
        { key: 'positional', name: 'Positional', description: 'Trusts engine evaluation, solid play' },
        { key: 'sacrificial', name: 'Sacrificial', description: 'Willing to sacrifice material for initiative' },
      ],
    }
  })

  app.get('/catalog/system-bots', async () => {
    return systemBotsData.systemBots
  })

  app.get('/catalog/levels', async () => {
    const { LEVEL_CONFIGS } = await import('../../models/progression.js')
    return Object.entries(LEVEL_CONFIGS).map(([level, config]) => ({
      level: parseInt(level),
      ...config,
    }))
  })

  app.get('/catalog/cosmetics', async () => {
    return cosmeticsData
  })

  app.get('/catalog/openings', async () => {
    return getAllOpenings()
  })

  app.get('/catalog/guide', async () => {
    return getGameGuide()
  })

  app.get('/catalog/onboarding', async () => {
    return getOnboardingGuide()
  })
}
