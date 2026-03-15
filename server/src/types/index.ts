export type AlignmentAttack = 'aggressive' | 'balanced' | 'defensive'
export type AlignmentStyle = 'chaotic' | 'positional' | 'sacrificial'
export type GameContext = 'training' | 'level_test' | 'human_play' | 'pvp'
export type GameResult = '1-0' | '0-1' | '1/2-1/2'
export type TrainingActionType = 'spar' | 'purchase_tactic' | 'drill'

export interface PlayParameters {
  searchDepth: number
  multiPv: number
  temperature: number
  blunderRate: number
  aggressionWeight: number
  positionalWeight: number
  tacticalWeight: number
  endgameWeight: number
  mlBlendWeight: number
  openingBook: OpeningBookEntry | null
  mlModel: MlModelHandle | null
  // Balance additions
  aggressionFocused: boolean    // ≥15: immune to blunders on forcing moves
  endgameFocused: boolean       // ≥15: +1 depth in endgame positions
  creativityFocused: boolean    // ≥15: "surprise bonus" for non-top-engine moves
  mlLearningMultiplier: number  // creativity bonus: 1.0 default, up to 1.5
}

export interface OpeningBookEntry {
  key: string
  positions: Record<string, string>
  proficiency: number
}

export interface MlModelHandle {
  botId: number
  weightsBlob: Buffer | null
}

export interface CandidateMove {
  move: string
  centipawns: number
  mate: number | null
  pv: string[]
}

export interface PositionRecord {
  fen: string
  movePlayed: string
  movePlayedUci?: string
  candidateMoves: CandidateMove[]
  color: 'w' | 'b'
}

export interface SimulatedGameResult {
  pgn: string
  result: GameResult
  moveCount: number
  positions: PositionRecord[]
}

export const ATTRIBUTE_TOTAL = 50
export const ATTRIBUTE_MIN = 0
export const ATTRIBUTE_MAX = 20

// Shared alignment maps (numeric encoding for ML features)
export const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
export const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

/** Determine outcome from a bot's perspective. */
export function determineOutcome(result: GameResult, botIsWhite: boolean): 'win' | 'loss' | 'draw' {
  if (result === '1/2-1/2') return 'draw'
  const whiteWon = result === '1-0'
  return (whiteWon === botIsWhite) ? 'win' : 'loss'
}

// --- Card System ---
export type CardType = 'prep' | 'powerup' | 'utility'
export type CardCategory = 'preparation' | 'powerup' | 'utility'

export interface CardDefinition {
  key: string
  name: string
  energy: number
  count: number
  category: CardCategory
  type: CardType
  color: string
  icon: string
  description: string
  flavor: string
  unlockedAtLevel: number
  effect: Record<string, any>
}

export interface HandCard {
  id: string        // unique instance id
  key: string       // card definition key
  name: string
  energy: number
  category: CardCategory
  type: CardType
  color: string
  icon: string
  description: string
  flavor: string
  effect: Record<string, any>
}

export interface HandState {
  cards: HandCard[]
  energy: number
  maxEnergy: number
  roundNumber: number
  cardsPlayed: number
  activeBuffs: any[]
  activePowerups: any[]
}

// --- Loot & Championship ---
export interface LootResult {
  type: 'none' | 'insight' | 'energy' | 'card' | 'intel'
  data: any
}

export interface ChampionshipBout {
  id: number
  botId: number
  targetLevel: number
  gamesPlayed: number
  gamesWon: number
  currentRound: number
  status: 'active' | 'won' | 'lost'
  gameRecordIds: number[]
}
