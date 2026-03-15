import { describe, it, expect } from 'vitest'
import { generateEmotionResponse, getBotCatchphrase } from '../../src/models/personality.js'

describe('Personality & Emotion System', () => {
  it('should generate happy emotions on win', () => {
    const response = generateEmotionResponse('win', 'spar', 'aggressive', 'chaotic', 5, 30)
    expect(['ecstatic', 'happy']).toContain(response.mood)
    expect(response.message.length).toBeGreaterThan(0)
    expect(response.face.length).toBeGreaterThan(0)
    expect(response.energy).toBeGreaterThan(50)
  })

  it('should generate sad/determined emotions on loss', () => {
    const response = generateEmotionResponse('loss', 'spar', 'balanced', 'positional', 3, 15)
    expect(['sad', 'determined', 'furious']).toContain(response.mood)
    expect(response.energy).toBeLessThan(60)
  })

  it('aggressive bots should be furious on loss, not just sad', () => {
    const response = generateEmotionResponse('loss', 'spar', 'aggressive', 'chaotic', 5, 40)
    // Aggressive bots get angry, not sad (unless quick loss)
    expect(['furious', 'determined']).toContain(response.mood)
  })

  it('should sparkle on dominant wins (short games)', () => {
    const response = generateEmotionResponse('win', 'spar', 'aggressive', 'sacrificial', 10, 20)
    expect(response.sparkle).toBe(true)
    expect(response.mood).toBe('ecstatic')
  })

  it('should sparkle on level up', () => {
    const response = generateEmotionResponse(null, 'level_up', 'balanced', 'positional', 5)
    expect(response.sparkle).toBe(true)
    expect(response.mood).toBe('ecstatic')
    expect(response.energy).toBe(100)
  })

  it('high-level bots should be composed even on loss', () => {
    const response = generateEmotionResponse('loss', 'spar', 'defensive', 'positional', 18, 40)
    // Level 18 bot should be determined, not sad/furious
    expect(response.mood).toBe('determined')
    expect(response.energy).toBeGreaterThanOrEqual(50)
  })

  it('should generate different messages for different alignments', () => {
    const messages = new Set<string>()
    const alignments = [
      ['aggressive', 'chaotic'],
      ['balanced', 'positional'],
      ['defensive', 'sacrificial'],
    ]

    for (const [attack, style] of alignments) {
      // Generate multiple to avoid random collisions
      for (let i = 0; i < 5; i++) {
        const response = generateEmotionResponse('win', 'spar', attack, style, 5, 30)
        messages.add(response.message)
      }
    }

    // Should have at least 3 distinct messages across alignment types
    expect(messages.size).toBeGreaterThanOrEqual(3)
  })

  it('should have catchphrases for all 9 alignment combinations', () => {
    const attacks = ['aggressive', 'balanced', 'defensive']
    const styles = ['chaotic', 'positional', 'sacrificial']

    for (const attack of attacks) {
      for (const style of styles) {
        const catchphrase = getBotCatchphrase(attack, style)
        expect(catchphrase.length).toBeGreaterThan(0)
      }
    }
  })

  it('idle emotions should vary by level', () => {
    const lowLevel = generateEmotionResponse(null, 'idle', 'balanced', 'chaotic', 3)
    const highLevel = generateEmotionResponse(null, 'idle', 'balanced', 'chaotic', 17)

    expect(lowLevel.mood).toBe('mischievous') // Young bots are playful
    expect(highLevel.mood).toBe('proud')       // Experienced bots are dignified
  })

  it('level test pass should be ecstatic with sparkle', () => {
    const response = generateEmotionResponse('win', 'level_test', 'aggressive', 'chaotic', 5)
    expect(response.mood).toBe('ecstatic')
    expect(response.sparkle).toBe(true)
    expect(response.energy).toBe(100)
    expect(response.message).toContain('CLEARED')
  })

  it('training events should make bot proud', () => {
    const drill = generateEmotionResponse(null, 'drill', 'balanced', 'positional', 5)
    expect(drill.mood).toBe('proud')
    expect(drill.energy).toBe(60)

    const tactic = generateEmotionResponse(null, 'tactic_learned', 'defensive', 'chaotic', 8)
    expect(tactic.mood).toBe('proud')
  })

  it('face ASCII art should match mood', () => {
    const happy = generateEmotionResponse('win', 'spar', 'balanced', 'positional', 5, 30)
    expect(happy.face.length).toBeGreaterThan(2) // ASCII faces are multi-char

    const sad = generateEmotionResponse('loss', 'spar', 'balanced', 'positional', 3, 15)
    expect(sad.face.length).toBeGreaterThan(2)

    // Different moods should (usually) have different faces
    expect(happy.face).not.toBe(sad.face)
  })
})
