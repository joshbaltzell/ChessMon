import type { PlayParameters } from '../types/index.js'

/**
 * An active buff that modifies PlayParameters before a fight.
 * Consumed when the fight starts.
 */
export interface ActiveBuff {
  id: string
  key: string
  name: string
  icon: string
  buff: string   // e.g. 'depthBonus', 'blunderReduction', 'tacticalBoost'
  value: number
}

/**
 * An active powerup that triggers during a fight.
 * Consumed as its conditions are met.
 */
export interface ActivePowerup {
  id: string
  key: string
  name: string
  icon: string
  powerup: string  // e.g. 'secondWind', 'luckyBreak', 'adrenaline', 'deepThought'
  // Powerup-specific data
  depthBonus?: number
  triggerMove?: number
  uses?: number
  moves?: number
  multiPv?: number
}

/**
 * Apply all active buffs to PlayParameters before a fight.
 * Returns a new PlayParameters object (does not mutate the original).
 * Buffs are consumed after this call.
 */
export function applyBuffs(params: PlayParameters, buffs: ActiveBuff[]): PlayParameters {
  const result = { ...params }

  for (const buff of buffs) {
    switch (buff.buff) {
      case 'depthBonus':
        result.searchDepth = Math.min(result.searchDepth + buff.value, 22)
        break
      case 'blunderReduction':
        result.blunderRate *= buff.value  // e.g. 0.5 = halve blunder rate
        break
      case 'tacticalBoost':
        result.tacticalWeight += buff.value
        break
      case 'aggressionBoost':
        result.aggressionWeight += buff.value
        break
      case 'endgameBoost':
        result.endgameWeight += buff.value
        break
      case 'mlBoost':
        result.mlBlendWeight = Math.min(result.mlBlendWeight + buff.value, 0.8)
        break
      case 'openingBoost':
        if (result.openingBook) {
          result.openingBook = {
            ...result.openingBook,
            proficiency: Math.min(result.openingBook.proficiency + buff.value, 100),
          }
        }
        break
    }
  }

  return result
}

/**
 * State tracked during a fight for powerup resolution.
 */
export interface PowerupState {
  powerups: ActivePowerup[]
  adrenalineMovesLeft: number
  luckyBreakUsesLeft: number
  secondWindActivated: boolean
  deepThoughtActive: boolean
}

/**
 * Initialize powerup state from active powerups.
 */
export function initPowerupState(powerups: ActivePowerup[]): PowerupState {
  let adrenalineMovesLeft = 0
  let luckyBreakUsesLeft = 0
  let deepThoughtActive = false

  for (const p of powerups) {
    switch (p.powerup) {
      case 'adrenaline':
        adrenalineMovesLeft += (p.moves || 10)
        break
      case 'luckyBreak':
        luckyBreakUsesLeft += (p.uses || 1)
        break
      case 'deepThought':
        deepThoughtActive = true
        break
    }
  }

  return {
    powerups,
    adrenalineMovesLeft,
    luckyBreakUsesLeft,
    secondWindActivated: false,
    deepThoughtActive,
  }
}

/**
 * Check and apply powerup effects at each move boundary.
 * Mutates the powerup state and returns any modifications to apply.
 */
export function resolvePowerupsForMove(
  state: PowerupState,
  moveNumber: number,
  params: PlayParameters,
  isLosing: boolean,
): { modifiedParams: PlayParameters; triggered: string[] } {
  const triggered: string[] = []
  const modified = { ...params }

  // Adrenaline: halve temperature while active
  if (state.adrenalineMovesLeft > 0) {
    modified.temperature = Math.max(0.1, modified.temperature * 0.5)
    state.adrenalineMovesLeft--
    if (state.adrenalineMovesLeft === 0) triggered.push('Adrenaline wore off')
  }

  // Deep Thought: increased multiPV
  if (state.deepThoughtActive) {
    modified.multiPv = 8
  }

  // Second Wind: activate when losing after trigger move
  if (!state.secondWindActivated && isLosing) {
    for (const p of state.powerups) {
      if (p.powerup === 'secondWind' && moveNumber >= (p.triggerMove || 20)) {
        modified.searchDepth = Math.min(modified.searchDepth + (p.depthBonus || 3), 22)
        state.secondWindActivated = true
        triggered.push('Second Wind activated! +' + (p.depthBonus || 3) + ' depth')
        break
      }
    }
  }

  return { modifiedParams: modified, triggered }
}

/**
 * Check if Lucky Break should skip a blunder.
 * Returns true if the blunder should be skipped (and consumes a use).
 */
export function tryLuckyBreak(state: PowerupState): boolean {
  if (state.luckyBreakUsesLeft > 0) {
    state.luckyBreakUsesLeft--
    return true
  }
  return false
}
