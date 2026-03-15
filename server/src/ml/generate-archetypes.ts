/**
 * Offline script to generate pre-trained archetype models for each alignment.
 *
 * Usage: npx tsx src/ml/generate-archetypes.ts
 *
 * This creates 9 archetype models (3 attack x 3 style) pre-trained on
 * synthetic style-labeled data. Each archetype represents the "ideal"
 * play style for that alignment, giving bots a meaningful starting personality.
 *
 * The output is saved to src/data/archetypes.json as a map of alignment keys
 * to base64-encoded model weight blobs.
 */

import { PreferenceModel, type TrainingSample } from './preference-model.js'
import { extractFeatures, FEATURE_DIM } from './feature-extractor.js'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Archetype attribute profiles: exaggerated builds for each alignment
const ARCHETYPE_PROFILES: Record<string, { aggression: number; positional: number; tactical: number; endgame: number; creativity: number }> = {
  // Attack axis: aggressive
  'aggressive_chaotic':      { aggression: 18, positional: 3, tactical: 10, endgame: 4, creativity: 15 },
  'aggressive_positional':   { aggression: 16, positional: 14, tactical: 8, endgame: 5, creativity: 7 },
  'aggressive_sacrificial':  { aggression: 18, positional: 4, tactical: 16, endgame: 4, creativity: 8 },
  // Attack axis: balanced
  'balanced_chaotic':        { aggression: 10, positional: 8, tactical: 10, endgame: 7, creativity: 15 },
  'balanced_positional':     { aggression: 8, positional: 16, tactical: 8, endgame: 10, creativity: 8 },
  'balanced_sacrificial':    { aggression: 12, positional: 6, tactical: 16, endgame: 6, creativity: 10 },
  // Attack axis: defensive
  'defensive_chaotic':       { aggression: 5, positional: 10, tactical: 8, endgame: 12, creativity: 15 },
  'defensive_positional':    { aggression: 4, positional: 18, tactical: 6, endgame: 16, creativity: 6 },
  'defensive_sacrificial':   { aggression: 6, positional: 10, tactical: 14, endgame: 14, creativity: 6 },
}

import { ALIGNMENT_ATTACK_MAP, ALIGNMENT_STYLE_MAP } from '../types/index.js'

// Curated set of common chess positions spanning opening, middlegame, endgame
const TRAINING_POSITIONS = [
  // Opening positions
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',          // 1.e4
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',          // 1.d4
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',     // 1.e4 e5 2.Nf3
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',   // 1.e4 e5 2.Nf3 Nc6
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',     // Sicilian 2.Nf3
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',       // 1.d4 Nf6
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2',       // French 2.d4
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',       // 1.d4 Nf6 2.c4

  // Early middlegame
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',   // Italian
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 5',   // Giuoco Piano
  'rnbqkb1r/pp2pppp/3p1n2/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4',     // Sicilian open
  'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3',      // Scotch

  // Middlegame positions
  'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 7 7',
  'r2qkb1r/pp1bpppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 4 7',
  'r1bq1rk1/pppnbppp/4pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 b - - 5 8',
  'r2q1rk1/pp2ppbp/2np1np1/8/3NP1b1/2N1BP2/PPPQ2PP/R3KB1R w KQ - 3 9',

  // Complex middlegame
  'r1b2rk1/2qnbppp/p2ppn2/1p4B1/3NP3/2N2Q2/PPP2PPP/2KR1B1R w - - 0 12',
  'r4rk1/pp1nqppp/2pbpn2/3p4/2PP4/1PN1PN2/PBQ2PPP/R4RK1 b - - 5 12',
  '2rqr1k1/pp1nbppp/4pn2/3p4/3P1B2/2NBPN2/PPQ2PPP/R4RK1 b - - 8 13',

  // Tactical positions
  'r1bqk2r/pppp1Bpp/2n2n2/2b1p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4',  // Fried liver-ish
  'r1b1k2r/ppppqppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 5 5',

  // Endgame positions
  '8/5ppk/4p2p/8/3PP3/5P2/6PP/6K1 w - - 0 35',        // Pawn endgame
  '8/8/4kpp1/8/4PP2/6K1/8/8 w - - 0 40',              // K+P vs K+P
  '2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 35',         // Rook endgame
  '8/p4pkp/6p1/8/P7/6PP/5PK1/8 w - - 0 42',           // Advanced pawn endgame
  '3r2k1/5ppp/8/8/8/2B5/5PPP/6K1 w - - 0 38',         // Bishop vs rook
  '8/5pk1/6p1/8/3N4/8/5PPP/6K1 w - - 0 40',           // Knight endgame
  '4r1k1/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 30',     // Rook endgame equal
  '8/8/2k5/8/3K4/8/1P6/8 w - - 0 50',                 // K+P vs K
]

// For each position, generate synthetic candidate moves with eval scores
// that represent typical multi-PV output
interface SyntheticCandidate {
  san: string
  centipawns: number
}

/**
 * Generate synthetic candidates for a position.
 * We don't use Stockfish here — instead we use the legal moves and assign
 * synthetic evaluations that create meaningful style training signals.
 */
async function generateSyntheticCandidates(fen: string): Promise<SyntheticCandidate[]> {
  // Import chess.js
  const { Chess } = await import('chess.js')
  const chess = new Chess(fen)
  const moves = chess.moves({ verbose: true })

  if (moves.length === 0) return []

  // Score moves with heuristic evaluations for style differentiation
  const scored = moves.map(move => {
    let score = 0

    // Captures get higher base score (aggressive signal)
    if (move.captured) {
      const capValues: Record<string, number> = { p: 100, n: 300, b: 310, r: 500, q: 900 }
      const pieceValues: Record<string, number> = { p: 100, n: 300, b: 310, r: 500, q: 900, k: 0 }
      score += (capValues[move.captured] || 0) - (pieceValues[move.piece] || 0) * 0.1
    }

    // Checks get a bonus (tactical/aggressive signal)
    chess.move(move.san)
    if (chess.isCheck()) score += 50
    chess.undo()

    // Center moves (positional signal)
    const toFile = move.to.charCodeAt(0) - 97
    const toRank = parseInt(move.to[1]) - 1
    if (toFile >= 2 && toFile <= 5 && toRank >= 2 && toRank <= 5) score += 20

    // Castling (positional/defensive signal)
    if (move.san === 'O-O' || move.san === 'O-O-O') score += 40

    // Promotions (tactical signal)
    if (move.promotion) score += 800

    // Add some randomness for variety
    score += (Math.random() - 0.5) * 60

    return { san: move.san, centipawns: Math.round(score) }
  })

  // Sort by score descending, take top 5
  scored.sort((a, b) => b.centipawns - a.centipawns)
  return scored.slice(0, 5)
}

async function generateArchetypes() {
  console.log('Generating archetype models for 9 alignment combinations...\n')

  const archetypes: Record<string, string> = {}

  for (const [key, attrs] of Object.entries(ARCHETYPE_PROFILES)) {
    const [attackStr, styleStr] = key.split('_')
    console.log(`  Training archetype: ${key} (${JSON.stringify(attrs)})`)

    const alignAttack = ALIGNMENT_ATTACK_MAP[attackStr]
    const alignStyle = ALIGNMENT_STYLE_MAP[styleStr]

    // Generate training samples from all positions
    const samples: TrainingSample[] = []

    for (const fen of TRAINING_POSITIONS) {
      const candidates = await generateSyntheticCandidates(fen)
      if (candidates.length === 0) continue

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]

        // Style-fit scoring (simplified version of the main pipeline logic)
        const maxCp = Math.max(...candidates.map(c => Math.abs(c.centipawns)), 1)
        const baseScore = (candidate.centipawns + maxCp) / (2 * maxCp)

        const norm = attrs.aggression + attrs.positional + attrs.tactical + attrs.endgame + attrs.creativity

        // Capture/check heuristic
        const isLikelyCapture = candidate.centipawns > 100
        const isLikelyCheck = candidate.san.includes('+')
        const isCloseToTop = i <= 1

        const aggressionFit = isLikelyCapture ? 0.8 : isLikelyCheck ? 0.7 : 0.3
        const positionalFit = 0.7 * baseScore + 0.3 * (isCloseToTop && !isLikelyCapture ? 1 : 0)
        const tacticalFit = (isLikelyCapture || isLikelyCheck) ? 0.7 : 0.4
        const endgameFit = baseScore * 0.6
        const creativityFit = i > 0 && Math.abs(candidate.centipawns - candidates[0].centipawns) < 50 ? 0.7 : 0.3

        const styleFit = (
          attrs.aggression / norm * aggressionFit +
          attrs.positional / norm * positionalFit +
          attrs.tactical / norm * tacticalFit +
          attrs.endgame / norm * endgameFit +
          attrs.creativity / norm * creativityFit
        )

        const engineRank = candidates.length > 1 ? 1 - i / (candidates.length - 1) : 1
        const label = Math.max(0, Math.min(1, 0.65 * styleFit + 0.35 * engineRank + (Math.random() - 0.5) * 0.05))

        const features = extractFeatures(
          fen, candidate.san, i, candidates.length,
          candidate.centipawns, 'w', attrs, alignAttack, alignStyle,
        )

        samples.push({ features, label })
      }
    }

    console.log(`    Generated ${samples.length} training samples`)

    // Train the archetype model
    const model = new PreferenceModel()
    const result = await model.train(samples, 50)
    const finalLoss = result.epochLosses[result.epochLosses.length - 1]
    console.log(`    Trained for ${result.epochLosses.length} epochs, final loss: ${finalLoss?.toFixed(4)}`)

    // Serialize to base64
    const blob = await model.serialize()
    archetypes[key] = blob.toString('base64')
    model.dispose()
  }

  // Write to data directory
  const outputPath = join(__dirname, '..', 'data', 'archetypes.json')
  writeFileSync(outputPath, JSON.stringify(archetypes, null, 2))
  console.log(`\nSaved archetypes to ${outputPath}`)
  console.log(`File size: ${(JSON.stringify(archetypes).length / 1024).toFixed(1)} KB`)
}

generateArchetypes().catch(console.error)
