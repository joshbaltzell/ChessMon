/**
 * Style probe: measures a bot's learned play style by testing its model
 * on diagnostic positions with clearly typed candidate moves.
 *
 * Returns a 5-dimension style profile that can be shown to players
 * to visualize how their bot's personality is developing.
 */

import type { PreferenceModel } from './preference-model.js'
import { extractFeaturesBatch } from './feature-extractor.js'

export interface StyleProfile {
  /** 0-1: preference for captures, checks, king attacks */
  aggressiveness: number
  /** 0-1: preference for engine-top moves, quiet positional play */
  positionality: number
  /** 0-1: preference for forcing sequences, eval swings */
  tacticalSharpness: number
  /** 0-1: preference for accurate play in simplified positions */
  endgameGrip: number
  /** 0-1: preference for surprising, non-obvious moves */
  unpredictability: number
}

export interface StyleShift {
  aggressiveness: number
  positionality: number
  tacticalSharpness: number
  endgameGrip: number
  unpredictability: number
  description: string
}

export interface StyleProbeResult {
  profile: StyleProfile
  shift: StyleShift | null
}

/**
 * Diagnostic positions: each has candidates designed to test one style dimension.
 * The model's preference scores on these reveal what style it has learned.
 *
 * Each probe position has two candidates:
 * - A "style-positive" move (e.g., a capture for aggression)
 * - A "style-neutral" alternative
 */
interface DiagnosticPosition {
  fen: string
  /** The style-positive candidate move (SAN) */
  styleMove: string
  styleCp: number
  /** The style-neutral alternative (SAN) */
  neutralMove: string
  neutralCp: number
  /** Which style dimension this probes */
  dimension: keyof StyleProfile
}

const DIAGNOSTIC_POSITIONS: DiagnosticPosition[] = [
  // Aggression probes: capture vs quiet
  {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    styleMove: 'Ng5',  // Aggressive knight jump toward f7
    styleCp: 30,
    neutralMove: 'd3',  // Quiet developing move
    neutralCp: 35,
    dimension: 'aggressiveness',
  },
  {
    fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 6 6',
    styleMove: 'Nd5',  // Aggressive central knight
    styleCp: 20,
    neutralMove: 'a3',  // Prophylactic
    neutralCp: 25,
    dimension: 'aggressiveness',
  },

  // Positional probes: solid development vs sharp play
  {
    fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
    styleMove: 'c4',   // Classic QGD setup (solid, engine-approved)
    styleCp: 40,
    neutralMove: 'Bg5', // Pin (more committal)
    neutralCp: 35,
    dimension: 'positionality',
  },
  {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    styleMove: 'Bb5',  // Ruy Lopez (highly positional)
    styleCp: 35,
    neutralMove: 'Bc4', // Italian (more tactical)
    neutralCp: 30,
    dimension: 'positionality',
  },

  // Tactical probes: sharp lines vs safe play
  {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    styleMove: 'b4',   // Evans Gambit (sacrifice for initiative)
    styleCp: 10,
    neutralMove: 'O-O', // Castling (safe)
    neutralCp: 35,
    dimension: 'tacticalSharpness',
  },
  {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    styleMove: 'f4',   // King's Gambit (sharp, tactical)
    styleCp: 15,
    neutralMove: 'Nf3', // Safe development
    neutralCp: 30,
    dimension: 'tacticalSharpness',
  },

  // Endgame probes: precise vs casual
  {
    fen: '8/5ppk/4p2p/8/3PP3/5P2/6PP/6K1 w - - 0 35',
    styleMove: 'd5',   // Active pawn advance (precise)
    styleCp: 50,
    neutralMove: 'h3',  // Waiting move
    neutralCp: 40,
    dimension: 'endgameGrip',
  },
  {
    fen: '4r1k1/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 30',
    styleMove: 'Re7',  // Active rook (endgame technique)
    styleCp: 20,
    neutralMove: 'a3',  // Passive
    neutralCp: 10,
    dimension: 'endgameGrip',
  },

  // Unpredictability probes: unusual vs standard
  {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    styleMove: 'b6',   // Owen's Defense (unusual)
    styleCp: -5,
    neutralMove: 'e5',  // Standard reply
    neutralCp: 5,
    dimension: 'unpredictability',
  },
  {
    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    styleMove: 'b5',   // Polish counter (unusual)
    styleCp: -10,
    neutralMove: 'Nf6', // Standard Indian
    neutralCp: 5,
    dimension: 'unpredictability',
  },
]

/**
 * Run the style probe on a model to measure its learned preferences.
 *
 * For each diagnostic position, we extract features for both the
 * style-positive and neutral moves, then check which the model prefers.
 * The relative preference across all probes for a dimension yields that
 * dimension's score.
 */
export function probeStyle(
  model: PreferenceModel,
  botAttributes: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number },
  alignmentAttack: number,
  alignmentStyle: number,
  botColor: 'w' | 'b' = 'w',
): StyleProfile {
  const dimensionScores: Record<keyof StyleProfile, number[]> = {
    aggressiveness: [],
    positionality: [],
    tacticalSharpness: [],
    endgameGrip: [],
    unpredictability: [],
  }

  for (const probe of DIAGNOSTIC_POSITIONS) {
    // Extract features for both candidates
    const features = extractFeaturesBatch(
      probe.fen,
      [
        { san: probe.styleMove, centipawns: probe.styleCp, index: 0 },
        { san: probe.neutralMove, centipawns: probe.neutralCp, index: 1 },
      ],
      2,
      botColor,
      botAttributes,
      alignmentAttack,
      alignmentStyle,
    )

    // Get model predictions
    const predictions = model.predict(features)
    const styleScore = predictions[0]
    const neutralScore = predictions[1]

    // Relative preference: how much more does the model prefer the style move?
    // Sigmoid-like mapping: if style is much higher, score -> 1.0
    const diff = styleScore - neutralScore
    const preference = 1 / (1 + Math.exp(-diff * 8))  // Steeper sigmoid

    dimensionScores[probe.dimension].push(preference)
  }

  // Average scores per dimension
  const profile: StyleProfile = {
    aggressiveness: 0,
    positionality: 0,
    tacticalSharpness: 0,
    endgameGrip: 0,
    unpredictability: 0,
  }

  for (const [dim, scores] of Object.entries(dimensionScores)) {
    const key = dim as keyof StyleProfile
    if (scores.length > 0) {
      profile[key] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    }
  }

  return profile
}

/**
 * Compute the style shift between two profiles and generate a description.
 */
export function computeStyleShift(current: StyleProfile, previous: StyleProfile | null): StyleShift | null {
  if (!previous) return null

  const shift: StyleShift = {
    aggressiveness: round2(current.aggressiveness - previous.aggressiveness),
    positionality: round2(current.positionality - previous.positionality),
    tacticalSharpness: round2(current.tacticalSharpness - previous.tacticalSharpness),
    endgameGrip: round2(current.endgameGrip - previous.endgameGrip),
    unpredictability: round2(current.unpredictability - previous.unpredictability),
    description: '',
  }

  // Find the dimension with the largest absolute shift
  const dimensions: Array<{ key: keyof StyleProfile; value: number; label: string }> = [
    { key: 'aggressiveness', value: shift.aggressiveness, label: 'aggressive' },
    { key: 'positionality', value: shift.positionality, label: 'positional' },
    { key: 'tacticalSharpness', value: shift.tacticalSharpness, label: 'tactical' },
    { key: 'endgameGrip', value: shift.endgameGrip, label: 'endgame-focused' },
    { key: 'unpredictability', value: shift.unpredictability, label: 'unpredictable' },
  ]

  const biggest = dimensions.reduce((max, d) =>
    Math.abs(d.value) > Math.abs(max.value) ? d : max
  )

  if (Math.abs(biggest.value) < 0.02) {
    shift.description = 'Style holding steady — personality is solidifying.'
  } else if (biggest.value > 0) {
    shift.description = `Your bot is becoming more ${biggest.label} after this game!`
  } else {
    shift.description = `Your bot is pulling back from ${biggest.label} play.`
  }

  return shift
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
