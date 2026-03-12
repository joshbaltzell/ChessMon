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
  openingBook: OpeningBookEntry | null
  mlModel: MlModelHandle | null
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
