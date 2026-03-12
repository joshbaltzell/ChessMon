import { createRequire } from 'module'
import type { OpeningBookEntry } from '../types/index.js'

const require = createRequire(import.meta.url)
const openingsData = require('../data/openings.json') as {
  openings: Array<{
    key: string
    name: string
    category: string
    minLevel: number
    positions: Record<string, string>
  }>
}

// Index all openings by key for O(1) lookup
const openingsByKey = new Map<string, typeof openingsData.openings[0]>()
for (const opening of openingsData.openings) {
  openingsByKey.set(opening.key, opening)
}

/**
 * Get the opening book entry for a bot's tactic, if it maps to a known opening.
 * Returns null if the tactic key doesn't correspond to an opening.
 */
export function getOpeningBook(tacticKey: string, proficiency: number): OpeningBookEntry | null {
  const opening = openingsByKey.get(tacticKey)
  if (!opening) return null
  return {
    key: opening.key,
    positions: opening.positions,
    proficiency,
  }
}

/**
 * Get the best opening book from a bot's tactics list.
 * Picks the opening with highest proficiency.
 */
export function getBestOpeningBook(
  tactics: Array<{ tacticKey: string; proficiency: number }>,
): OpeningBookEntry | null {
  let best: OpeningBookEntry | null = null

  for (const tactic of tactics) {
    const book = getOpeningBook(tactic.tacticKey, tactic.proficiency)
    if (book && (!best || book.proficiency > best.proficiency)) {
      best = book
    }
  }

  return best
}

/**
 * Get all available openings for the catalog.
 */
export function getAllOpenings() {
  return openingsData.openings.map(o => ({
    key: o.key,
    name: o.name,
    category: o.category,
    minLevel: o.minLevel,
    positionCount: Object.keys(o.positions).length,
  }))
}
