import { Chess } from 'chess.js'

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
}

/**
 * Extract a 128-dimensional feature vector from a chess position + candidate move.
 *
 * Layout:
 *   [0..63]   Board features: piece encoding per square (own=+, opponent=-)
 *   [64..95]  Move features: from/to encoding, piece types, tactical flags
 *   [96..127] Context features: material, game phase, attributes, alignment
 *
 * Performance: reuses a single Chess instance and caches board() result.
 * For batch extraction from the same position, use extractFeaturesBatch().
 */
export function extractFeatures(
  fen: string,
  moveSan: string,
  candidateIndex: number,
  totalCandidates: number,
  centipawns: number,
  botColor: 'w' | 'b',
  attributes: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number },
  alignmentAttack: number, // 0=aggressive, 1=balanced, 2=defensive
  alignmentStyle: number,  // 0=chaotic, 1=positional, 2=sacrificial
): Float32Array {
  const chess = new Chess(fen)
  return extractFeaturesFromChess(
    chess, chess.board(), moveSan, candidateIndex, totalCandidates,
    centipawns, botColor, attributes, alignmentAttack, alignmentStyle,
  )
}

/**
 * Batch-extract features for multiple candidate moves from the same position.
 * Creates only ONE Chess instance and ONE board() call for all candidates.
 */
export function extractFeaturesBatch(
  fen: string,
  candidates: Array<{ san: string; centipawns: number; index: number }>,
  totalCandidates: number,
  botColor: 'w' | 'b',
  attributes: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number },
  alignmentAttack: number,
  alignmentStyle: number,
): Float32Array[] {
  const chess = new Chess(fen)
  const board = chess.board()
  return candidates.map(c =>
    extractFeaturesFromChess(
      chess, board, c.san, c.index, totalCandidates,
      c.centipawns, botColor, attributes, alignmentAttack, alignmentStyle,
    )
  )
}

// Preallocated piece type lookup for fast index
const PIECE_TYPE_INDEX: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 }

function extractFeaturesFromChess(
  chess: Chess,
  board: ReturnType<Chess['board']>,
  moveSan: string,
  candidateIndex: number,
  totalCandidates: number,
  centipawns: number,
  botColor: 'w' | 'b',
  attributes: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number },
  alignmentAttack: number,
  alignmentStyle: number,
): Float32Array {
  const features = new Float32Array(128)

  // --- Board features [0..63] + material/piece counts in single pass ---
  let ownMaterial = 0
  let oppMaterial = 0
  let ownPieceCount = 0
  let oppPieceCount = 0
  let ownPawnCount = 0
  let ownPawnFiles = 0 // bitfield for pawn file coverage

  for (let rank = 0; rank < 8; rank++) {
    const row = board[rank]
    for (let file = 0; file < 8; file++) {
      const piece = row[file]
      if (piece) {
        const value = PIECE_VALUES[piece.type] || 0
        const isOwn = piece.color === botColor
        features[rank * 8 + file] = isOwn ? value / 9 : -value / 9

        if (isOwn) {
          ownMaterial += value
          ownPieceCount++
          if (piece.type === 'p') {
            ownPawnCount++
            ownPawnFiles |= (1 << file)
          }
        } else {
          oppMaterial += value
          oppPieceCount++
        }
      }
    }
  }

  // --- Move features [64..95] ---
  // Reuse the same chess instance (undo after)
  try {
    const moveObj = chess.move(moveSan)
    if (moveObj) {
      const fromFile = moveObj.from.charCodeAt(0) - 97
      const fromRank = parseInt(moveObj.from[1]) - 1
      features[64] = fromFile / 7
      features[65] = fromRank / 7
      const toFile = moveObj.to.charCodeAt(0) - 97
      const toRank = parseInt(moveObj.to[1]) - 1
      features[66] = toFile / 7
      features[67] = toRank / 7

      features[68] = (Math.abs(toFile - fromFile) + Math.abs(toRank - fromRank)) / 14

      const pieceIdx = PIECE_TYPE_INDEX[moveObj.piece]
      if (pieceIdx !== undefined) features[69 + pieceIdx] = 1

      features[75] = moveObj.captured ? 1 : 0
      features[76] = moveObj.san.includes('+') || moveObj.san.includes('#') ? 1 : 0
      features[77] = moveObj.promotion ? 1 : 0

      if (moveObj.captured) {
        const capIdx = PIECE_TYPE_INDEX[moveObj.captured]
        if (capIdx !== undefined) features[78 + capIdx] = 1
      }

      features[84] = 1 / (1 + Math.exp(-centipawns / 200))
      features[85] = totalCandidates > 1 ? candidateIndex / (totalCandidates - 1) : 0

      features[86] = (toFile >= 3 && toFile <= 4 && toRank >= 3 && toRank <= 4) ? 1 : 0
      features[87] = moveObj.san === 'O-O' || moveObj.san === 'O-O-O' ? 1 : 0
      features[88] = moveObj.captured ? (PIECE_VALUES[moveObj.captured] || 0) / 9 : 0
      features[89] = (PIECE_VALUES[moveObj.piece] || 0) / 9

      if (moveObj.piece === 'p') {
        const promoRank = botColor === 'w' ? 7 : 0
        features[90] = 1 - Math.abs(toRank - promoRank) / 7
      }

      features[91] = features[76]

      // Undo move to restore position for next candidate
      chess.undo()
    }
  } catch {
    // Move parsing failed, leave zeros
  }

  // --- Context features [96..127] ---
  features[96] = Math.min(chess.moveNumber() / 40, 1)

  features[97] = ownMaterial / 39
  features[98] = oppMaterial / 39
  features[99] = (ownMaterial - oppMaterial + 39) / 78

  const totalMaterial = ownMaterial + oppMaterial
  features[100] = totalMaterial > 50 ? 1 : totalMaterial > 30 ? 0.66 : totalMaterial > 15 ? 0.33 : 0
  features[101] = totalMaterial <= 24 ? 1 : 0

  features[102] = attributes.aggression / 20
  features[103] = attributes.positional / 20
  features[104] = attributes.tactical / 20
  features[105] = attributes.endgame / 20
  features[106] = attributes.creativity / 20

  features[107 + alignmentAttack] = 1
  features[110 + alignmentStyle] = 1

  features[113] = chess.turn() === botColor ? 1 : 0

  const castling = chess.getCastlingRights(botColor)
  features[114] = castling.k ? 1 : 0
  features[115] = castling.q ? 1 : 0
  const oppCastling = chess.getCastlingRights(botColor === 'w' ? 'b' : 'w')
  features[116] = oppCastling.k ? 1 : 0
  features[117] = oppCastling.q ? 1 : 0

  // Approximate mobility from piece count instead of expensive moves() call
  features[118] = Math.min((ownPieceCount * 3.5) / 40, 1)

  features[119] = chess.isCheck() ? 1 : 0

  features[120] = ownPieceCount / 16
  features[121] = oppPieceCount / 16

  features[122] = ownPawnCount / 8
  // Count set bits in ownPawnFiles for file coverage
  let fileCount = ownPawnFiles
  fileCount = fileCount - ((fileCount >> 1) & 0x55)
  fileCount = (fileCount & 0x33) + ((fileCount >> 2) & 0x33)
  fileCount = (fileCount + (fileCount >> 4)) & 0x0F
  features[123] = fileCount / 8

  // Style indicator features [124-127]: explicit signals for style learning
  // These encode "is this move aggressive/positional/tactical/creative?" directly,
  // helping the model learn style dimensions faster with less data.

  // [124] Aggressiveness indicator: captures, checks, king attacks
  const isCapture = features[75] > 0
  const isCheck = features[76] > 0
  features[124] = (
    0.4 * (isCapture ? 1 : 0) +
    0.4 * (isCheck ? 1 : 0) +
    0.2 * (features[88] > 0.3 ? 1 : 0) // High-value capture
  )

  // [125] Positionality indicator: engine agreement, quiet strong moves
  const isTopCandidate = candidateIndex <= 1
  features[125] = (
    0.5 * (isTopCandidate ? 1 : 0) +
    0.3 * (features[87] > 0 ? 1 : 0) + // Castling
    0.2 * (!isCapture && !isCheck && isTopCandidate ? 1 : 0) // Quiet strong
  )

  // [126] Tactical sharpness: eval-justified forcing moves
  const evalAdvantage = 1 / (1 + Math.exp(-centipawns / 200))
  features[126] = (
    0.3 * (isCapture ? 1 : 0) +
    0.3 * (isCheck ? 1 : 0) +
    0.2 * evalAdvantage +
    0.2 * (features[77] > 0 ? 1 : 0) // Promotion
  )

  // [127] Creativity indicator: non-obvious but playable moves
  features[127] = candidateIndex > 0 && candidateIndex <= 3 &&
    Math.abs(centipawns) < 100 ? 0.7 : candidateIndex === 0 ? 0.2 : 0.1

  return features
}

export const FEATURE_DIM = 128
