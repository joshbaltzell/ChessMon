import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getXpForSpar } from '../../src/models/progression.js'

// Track mock calls for CardService and LootService
let mockGetHandState: ReturnType<typeof vi.fn>
let mockGetWinStreak: ReturnType<typeof vi.fn>
let mockSetWinStreak: ReturnType<typeof vi.fn>
let mockAddEnergy: ReturnType<typeof vi.fn>
let mockRollLoot: ReturnType<typeof vi.fn>

// Mock the expensive modules
vi.mock('../../src/engine/game-simulator.js', () => ({
  simulateGame: vi.fn(),
}))

vi.mock('../../src/ml/training-pipeline.js', () => ({
  trainBotFromGame: vi.fn(),
}))

vi.mock('../../src/ml/model-store.js', () => ({
  loadModel: vi.fn().mockResolvedValue(null),
  getOrCreateModel: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../src/models/personality.js', () => ({
  generateEmotionResponse: vi.fn().mockReturnValue({ mood: 'happy', message: 'Great game!' }),
}))

vi.mock('../../src/models/battle-commentary.js', () => ({
  generateMatchRecap: vi.fn().mockReturnValue({
    summary: 'A good game.',
    keyMoments: [{ move: 5, description: 'Key moment' }],
  }),
}))

vi.mock('../../src/engine/opening-book.js', () => ({
  getBestOpeningBook: vi.fn().mockReturnValue(null),
}))

vi.mock('../../src/models/bot-intelligence.js', () => ({
  botToPlayParameters: vi.fn().mockReturnValue({ depth: 3, blunderRate: 0.1 }),
  systemBotPlayParameters: vi.fn().mockReturnValue({ depth: 3, blunderRate: 0.15 }),
}))

vi.mock('../../src/ml/style-probe.js', () => ({
  probeStyle: vi.fn(),
  computeStyleShift: vi.fn(),
}))

vi.mock('../../src/services/card.service.js', () => {
  const CardService = function(this: any) {
    this.getHandState = (...args: any[]) => mockGetHandState(...args)
    this.getWinStreak = (...args: any[]) => mockGetWinStreak(...args)
    this.setWinStreak = (...args: any[]) => mockSetWinStreak(...args)
    this.addEnergy = (...args: any[]) => mockAddEnergy(...args)
  }
  return { CardService }
})

vi.mock('../../src/services/loot.service.js', () => {
  const LootService = function(this: any) {
    this.rollLoot = (...args: any[]) => mockRollLoot(...args)
  }
  return { LootService }
})

import { TrainingService } from '../../src/services/training.service.js'
import { simulateGame } from '../../src/engine/game-simulator.js'
import { trainBotFromGame } from '../../src/ml/training-pipeline.js'
import { systemBotPlayParameters } from '../../src/models/bot-intelligence.js'
import { generateMatchRecap } from '../../src/models/battle-commentary.js'
import { generateEmotionResponse } from '../../src/models/personality.js'

// Build a minimal mock DB
function createMockDb() {
  const botData: any = {
    id: 1, playerId: 1, name: 'TestBot',
    level: 3, elo: 600, xp: 100, gamesPlayed: 5,
    aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
    alignmentAttack: 'balanced', alignmentStyle: 'positional',
    trainingPointsRemaining: 10, mlWeightsBlob: null, mlReplayBuffer: null,
  }

  const insertedGameRecord = { id: 42 }

  return {
    botData,
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn().mockImplementation(() => botData),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(insertedGameRecord),
        }),
        run: vi.fn(),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    }),
  }
}

describe('quickSpar', () => {
  let mockDb: ReturnType<typeof createMockDb>
  let trainingService: TrainingService
  let mathRandomSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    // Re-create mock functions fresh each test
    mockGetHandState = vi.fn().mockReturnValue({ cards: [], energy: 5, maxEnergy: 10, roundNumber: 1, cardsPlayed: 0 })
    mockGetWinStreak = vi.fn().mockReturnValue(0)
    mockSetWinStreak = vi.fn()
    mockAddEnergy = vi.fn()
    mockRollLoot = vi.fn().mockReturnValue({ type: 'none', data: null })

    mockDb = createMockDb()

    ;(simulateGame as any).mockReset()
    ;(simulateGame as any).mockResolvedValue({
      result: '1-0', moveCount: 30, pgn: '1. e4 e5 2. Nf3 *', positions: [],
    })
    ;(trainBotFromGame as any).mockReset()
    ;(trainBotFromGame as any).mockResolvedValue({
      samplesUsed: 10, epochLosses: [0.5, 0.4], updatedReplayBuffer: Buffer.from('[]'),
    })
    ;(generateMatchRecap as any).mockReturnValue({
      summary: 'A good game.',
      keyMoments: [{ move: 5, description: 'Key moment' }],
    })
    ;(generateEmotionResponse as any).mockReturnValue({ mood: 'happy', message: 'Great game!' })
    ;(systemBotPlayParameters as any).mockReturnValue({ depth: 3, blunderRate: 0.15 })

    const mockPool = {} as any
    trainingService = new TrainingService(mockDb as any, mockPool)
  })

  afterEach(() => {
    if (mathRandomSpy) {
      mathRandomSpy.mockRestore()
      mathRandomSpy = null
    }
  })

  it('should not deduct training points', async () => {
    const result = await trainingService.quickSpar(1)

    // Verify the bot update call does NOT include trainingPointsRemaining
    const setCalls = mockDb.update.mock.results
      .map((r: any) => r.value.set.mock.calls)
      .flat()

    // Find the call that updates xp/elo/gamesPlayed
    const botUpdateCalls = setCalls.filter((c: any) => c[0].xp !== undefined)
    for (const call of botUpdateCalls) {
      expect(call[0]).not.toHaveProperty('trainingPointsRemaining')
    }
  })

  it('should grant level-appropriate XP using getXpForSpar', async () => {
    // Bot is white and wins (1-0)
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2) // < 0.5 = white

    const result = await trainingService.quickSpar(1)

    // For level 3 bot, win gives 20 XP (from QUICK_SPAR_XP table)
    const expectedXp = getXpForSpar(3, 'win', 1)
    expect(result.xpGained).toBe(expectedXp)
  })

  it('should grant +1 base energy', async () => {
    await trainingService.quickSpar(1)

    expect(mockAddEnergy).toHaveBeenCalledWith(1, 1)
  })

  it('should increment win streak on win', async () => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2)
    ;(simulateGame as any).mockResolvedValueOnce({
      result: '1-0', moveCount: 25, pgn: '1. e4 *', positions: [],
    })
    mockGetWinStreak.mockReturnValue(2)

    const result = await trainingService.quickSpar(1)

    expect(mockSetWinStreak).toHaveBeenCalledWith(1, 3)
    expect(result.streak).toBe(3)
  })

  it('should reset win streak on loss', async () => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2)
    ;(simulateGame as any).mockResolvedValueOnce({
      result: '0-1', moveCount: 25, pgn: '1. e4 *', positions: [],
    })
    mockGetWinStreak.mockReturnValue(5)

    const result = await trainingService.quickSpar(1)

    expect(mockSetWinStreak).toHaveBeenCalledWith(1, 0)
    expect(result.streak).toBe(0)
  })

  it('should not affect streak on draw', async () => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2)
    ;(simulateGame as any).mockResolvedValueOnce({
      result: '1/2-1/2', moveCount: 50, pgn: '1. e4 *', positions: [],
    })
    mockGetWinStreak.mockReturnValue(2)

    const result = await trainingService.quickSpar(1)

    expect(mockSetWinStreak).not.toHaveBeenCalled()
    expect(result.streak).toBe(2)
  })

  it('should grant +2 bonus energy at streak >= 3', async () => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2)
    ;(simulateGame as any).mockResolvedValueOnce({
      result: '1-0', moveCount: 25, pgn: '1. e4 *', positions: [],
    })
    mockGetWinStreak.mockReturnValue(2)

    const result = await trainingService.quickSpar(1)

    expect(mockAddEnergy).toHaveBeenCalledWith(1, 1)
    expect(mockAddEnergy).toHaveBeenCalledWith(1, 2)
    expect(result.energyEarned).toBe(3)
  })

  it('should use opponent level max(1, bot.level - 1)', async () => {
    await trainingService.quickSpar(1)

    expect(systemBotPlayParameters).toHaveBeenCalledWith(2)
  })

  it('should use opponent level 1 when bot is level 1', async () => {
    mockDb.botData.level = 1

    await trainingService.quickSpar(1)

    expect(systemBotPlayParameters).toHaveBeenCalledWith(1)
  })

  it('should include loot result in response', async () => {
    mockRollLoot.mockReturnValue({ type: 'insight', data: { text: 'A great insight' } })

    const result = await trainingService.quickSpar(1)

    expect(result.loot).toEqual({ type: 'insight', data: { text: 'A great insight' } })
  })

  it('should add energy from energy loot', async () => {
    mockRollLoot.mockReturnValue({ type: 'energy', data: { amount: 1 } })

    const result = await trainingService.quickSpar(1)

    expect(result.energyEarned).toBeGreaterThanOrEqual(2)
    const addEnergyCalls = mockAddEnergy.mock.calls
    expect(addEnergyCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('should train ML with 6 epochs', async () => {
    await trainingService.quickSpar(1)

    expect(trainBotFromGame).toHaveBeenCalledTimes(1)
    const callArgs = (trainBotFromGame as any).mock.calls[0]
    // Arg 1 is botId
    expect(callArgs[1]).toBe(1)
    // Arg 5 is bot attributes (should include aggression etc)
    expect(callArgs[5]).toMatchObject({
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
    })
    // Last arg is options with epochs: 6
    expect(callArgs[7]).toEqual({ epochs: 6 })
  })

  it('should return the correct result shape', async () => {
    const result = await trainingService.quickSpar(1)

    expect(result).toHaveProperty('game')
    expect(result).toHaveProperty('xpGained')
    expect(result).toHaveProperty('eloChange')
    expect(result).toHaveProperty('newElo')
    expect(result).toHaveProperty('energyEarned')
    expect(result).toHaveProperty('loot')
    expect(result).toHaveProperty('streak')
    expect(result).toHaveProperty('keyMoments')
    expect(result).toHaveProperty('mlTraining')
    expect(result).toHaveProperty('emotion')
    expect(result).toHaveProperty('recap')

    expect(result.game).toHaveProperty('id')
    expect(result.game).toHaveProperty('result')
    expect(result.game).toHaveProperty('moveCount')
    expect(result.game).toHaveProperty('pgn')
    expect(result.game).toHaveProperty('botPlayedWhite')
    expect(result.game).toHaveProperty('opponent')
    expect(result.mlTraining).toHaveProperty('samplesUsed')
    expect(result.mlTraining).toHaveProperty('finalLoss')
  })

  it('should throw if bot not found', async () => {
    mockDb.get = vi.fn().mockReturnValue(undefined)

    await expect(trainingService.quickSpar(999)).rejects.toThrow('Bot not found')
  })
})
