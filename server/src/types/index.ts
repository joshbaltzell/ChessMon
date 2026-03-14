export type AlignmentAttack = 'aggressive' | 'balanced' | 'defensive'
export type AlignmentStyle = 'chaotic' | 'positional' | 'sacrificial'
export type GameContext = 'training' | 'level_test' | 'human_play'
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

// --- Card System ---
export type CardType = 'combat' | 'training' | 'knowledge' | 'insight' | 'utility'

export interface CardDefinition {
  key: string
  name: string
  energy: number
  count: number
  type: CardType
  color: string
  icon: string
  description: string
  flavor: string
  unlockedAtLevel: number
}

export interface HandCard {
  id: string        // unique instance id (e.g. "spar_3")
  key: string       // card definition key
  name: string
  energy: number
  type: CardType
  color: string
  icon: string
  description: string
  flavor: string
}

export interface HandState {
  cards: HandCard[]
  energy: number
  maxEnergy: number
  roundNumber: number
  cardsPlayed: number
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
