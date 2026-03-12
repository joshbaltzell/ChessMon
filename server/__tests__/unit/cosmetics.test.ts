import { describe, it, expect } from 'vitest'
import { getAsciiArt, getAvailableSkins, getSkinById, getDesignPacks } from '../../src/models/cosmetics.js'

describe('Cosmetics System', () => {
  it('should return ASCII art for all 5 tiers', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const art = getAsciiArt(tier)
      expect(art).toBeInstanceOf(Array)
      expect(art.length).toBeGreaterThan(0)
    }
  })

  it('tier 1 art should be simpler than tier 5', () => {
    const tier1 = getAsciiArt(1)
    const tier5 = getAsciiArt(5, undefined, 'aggressive')
    // Higher tiers have more lines
    expect(tier5.length).toBeGreaterThan(tier1.length)
  })

  it('tier 5 should have alignment-specific art', () => {
    const aggressive = getAsciiArt(5, undefined, 'aggressive')
    const defensive = getAsciiArt(5, undefined, 'defensive')
    expect(aggressive).not.toEqual(defensive)
  })

  it('should handle mood-specific frames for tier 1', () => {
    const happy = getAsciiArt(1, 'happy')
    const sad = getAsciiArt(1, 'sad')
    expect(happy).not.toEqual(sad)
  })

  it('should fall back to default for unknown mood', () => {
    const art = getAsciiArt(1, 'nonexistent_mood')
    expect(art).toBeInstanceOf(Array)
    expect(art.length).toBeGreaterThan(0)
  })

  it('new player should only have default skin', () => {
    const skins = getAvailableSkins(1, 0)
    expect(skins.length).toBe(1)
    expect(skins[0].id).toBe('default')
  })

  it('level 5 player should unlock flame skin', () => {
    const skins = getAvailableSkins(5, 10)
    const flameFound = skins.find(s => s.id === 'flame')
    expect(flameFound).toBeDefined()
  })

  it('level 20 player should unlock diamond skin', () => {
    const skins = getAvailableSkins(20, 200)
    const diamond = skins.find(s => s.id === 'diamond')
    expect(diamond).toBeDefined()
  })

  it('getSkinById should return correct skin', () => {
    const skin = getSkinById('gold')
    expect(skin).not.toBeNull()
    expect(skin!.name).toBe('Golden Champion')
    expect(skin!.rarity).toBe('epic')
  })

  it('getSkinById should return null for unknown skin', () => {
    expect(getSkinById('nonexistent')).toBeNull()
  })

  it('design packs should unlock progressively', () => {
    const level1Packs = getDesignPacks(1, 0)
    const level10Packs = getDesignPacks(10, 20)
    expect(level10Packs.length).toBeGreaterThan(level1Packs.length)
  })

  it('skins should have required fields', () => {
    const skins = getAvailableSkins(20, 200)
    for (const skin of skins) {
      expect(skin.id).toBeTruthy()
      expect(skin.name).toBeTruthy()
      expect(skin.description).toBeTruthy()
      expect(skin.rarity).toBeTruthy()
    }
  })
})
