import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const cosmeticsData = require('../data/cosmetics.json') as {
  asciiArt: Record<string, { levelRange: string; description: string; frames: Record<string, string[]> }>
  skins: Array<{ id: string; name: string; description: string; unlockedBy: string; rarity: string }>
  designPacks: Array<{ id: string; name: string; description: string; unlockedBy: string; boardTheme: string }>
}

export function getAsciiArt(tier: number, mood?: string, alignmentAttack?: string): string[] {
  const tierKey = `tier${tier}`
  const tierData = cosmeticsData.asciiArt[tierKey]
  if (!tierData) return cosmeticsData.asciiArt.tier1.frames.default

  const frames = tierData.frames
  // For tier 5, use alignment-specific art
  if (tier === 5 && alignmentAttack && frames[alignmentAttack]) {
    return frames[alignmentAttack]
  }
  // Try mood-specific frame
  if (mood && frames[mood]) {
    return frames[mood]
  }
  return frames.default || Object.values(frames)[0]
}

export function getAvailableSkins(level: number, gamesPlayed: number): typeof cosmeticsData.skins {
  return cosmeticsData.skins.filter(skin => {
    if (skin.unlockedBy === 'default') return true
    if (skin.unlockedBy.startsWith('reach_level_')) {
      const reqLevel = parseInt(skin.unlockedBy.replace('reach_level_', ''))
      return level >= reqLevel
    }
    if (skin.unlockedBy === 'win_50_games') return gamesPlayed >= 50
    if (skin.unlockedBy === 'play_100_human_games') return gamesPlayed >= 100
    return false
  })
}

export function getSkinById(skinId: string) {
  return cosmeticsData.skins.find(s => s.id === skinId) || null
}

export function getDesignPacks(level: number, gamesPlayed: number) {
  return cosmeticsData.designPacks.filter(pack => {
    if (pack.unlockedBy === 'default') return true
    if (pack.unlockedBy.startsWith('reach_level_')) {
      const reqLevel = parseInt(pack.unlockedBy.replace('reach_level_', ''))
      return level >= reqLevel
    }
    if (pack.unlockedBy === 'play_50_human_games') return gamesPlayed >= 50
    return false
  })
}
