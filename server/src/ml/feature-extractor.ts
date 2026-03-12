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
  const features = new Float32Array(128)
  const chess = new Chess(fen)

  // --- Board features [0..63] ---
  const board = chess.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      const idx = rank * 8 + file
      if (piece) {
        const value = PIECE_VALUES[piece.type] || 0
        features[idx] = piece.color === botColor ? value / 9 : -value / 9
      }
    }
  }

  // --- Move features [64..95] ---
  try {
    const tempChess = new Chess(fen)
    const moveObj = tempChess.move(moveSan)
    if (moveObj) {
      // From square encoding (rank, file normalized to 0-1)
      const fromFile = moveObj.from.charCodeAt(0) - 97
      const fromRank = parseInt(moveObj.from[1]) - 1
      features[64] = fromFile / 7
      features[65] = fromRank / 7
      // To square encoding
      const toFile = moveObj.to.charCodeAt(0) - 97
      const toRank = parseInt(moveObj.to[1]) - 1
      features[66] = toFile / 7
      features[67] = toRank / 7

      // Distance moved
      features[68] = (Math.abs(toFile - fromFile) + Math.abs(toRank - fromRank)) / 14

      // Piece type one-hot [69..74]
      const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k']
      const pieceIdx = pieceTypes.indexOf(moveObj.piece)
      if (pieceIdx >= 0) features[69 + pieceIdx] = 1

      // Tactical flags
      features[75] = moveObj.captured ? 1 : 0
      features[76] = moveObj.san.includes('+') || moveObj.san.includes('#') ? 1 : 0
      features[77] = moveObj.promotion ? 1 : 0

      // Captured piece type one-hot [78..83]
      if (moveObj.captured) {
        const capIdx = pieceTypes.indexOf(moveObj.captured)
        if (capIdx >= 0) features[78 + capIdx] = 1
      }

      // Centipawn eval (sigmoid-normalized)
      features[84] = 1 / (1 + Math.exp(-centipawns / 200))

      // Rank among candidates (0=best)
      features[85] = totalCandidates > 1 ? candidateIndex / (totalCandidates - 1) : 0

      // Targets center squares (d4,d5,e4,e5)
      const isCenterTarget = (toFile >= 3 && toFile <= 4 && toRank >= 3 && toRank <= 4) ? 1 : 0
      features[86] = isCenterTarget

      // Is castling
      features[87] = moveObj.san === 'O-O' || moveObj.san === 'O-O-O' ? 1 : 0

      // Material value of captured piece
      features[88] = moveObj.captured ? (PIECE_VALUES[moveObj.captured] || 0) / 9 : 0

      // Moving piece value (sacrifice potential - high value pieces moving into danger)
      features[89] = (PIECE_VALUES[moveObj.piece] || 0) / 9

      // Check if it's a pawn advance toward promotion
      if (moveObj.piece === 'p') {
        const promoRank = botColor === 'w' ? 7 : 0
        features[90] = 1 - Math.abs(toRank - promoRank) / 7
      }

      // Is it a check that leads to a forcing sequence
      features[91] = features[76] // re-use check flag weighted differently in model
    }
  } catch {
    // Move parsing failed, leave zeros
  }

  // --- Context features [96..127] ---
  const moveNumber = chess.moveNumber()
  features[96] = Math.min(moveNumber / 40, 1) // Game phase (0=opening, 1=late)

  // Material balance
  let ownMaterial = 0
  let oppMaterial = 0
  const flatBoard = chess.board().flat()
  for (const piece of flatBoard) {
    if (piece) {
      const val = PIECE_VALUES[piece.type] || 0
      if (piece.color === botColor) ownMaterial += val
      else oppMaterial += val
    }
  }
  features[97] = ownMaterial / 39  // Max material = 39 (Q+2R+2B+2N+8P)
  features[98] = oppMaterial / 39
  features[99] = (ownMaterial - oppMaterial + 39) / 78 // Normalized balance

  // Game phase (based on total material)
  const totalMaterial = ownMaterial + oppMaterial
  features[100] = totalMaterial > 50 ? 1 : totalMaterial > 30 ? 0.66 : totalMaterial > 15 ? 0.33 : 0

  // Is endgame
  features[101] = totalMaterial <= 24 ? 1 : 0

  // Bot attributes (normalized 0-1)
  features[102] = attributes.aggression / 20
  features[103] = attributes.positional / 20
  features[104] = attributes.tactical / 20
  features[105] = attributes.endgame / 20
  features[106] = attributes.creativity / 20

  // Alignment one-hot encoding
  features[107 + alignmentAttack] = 1 // 107, 108, or 109
  features[110 + alignmentStyle] = 1   // 110, 111, or 112

  // Side to move
  features[113] = chess.turn() === botColor ? 1 : 0

  // Castling rights
  const castling = chess.getCastlingRights(botColor)
  features[114] = castling.k ? 1 : 0
  features[115] = castling.q ? 1 : 0
  const oppCastling = chess.getCastlingRights(botColor === 'w' ? 'b' : 'w')
  features[116] = oppCastling.k ? 1 : 0
  features[117] = oppCastling.q ? 1 : 0

  // Number of legal moves (mobility indicator)
  features[118] = Math.min(chess.moves().length / 40, 1)

  // Is in check
  features[119] = chess.isCheck() ? 1 : 0

  // Piece counts
  let ownPieceCount = 0
  let oppPieceCount = 0
  for (const piece of flatBoard) {
    if (piece) {
      if (piece.color === botColor) ownPieceCount++
      else oppPieceCount++
    }
  }
  features[120] = ownPieceCount / 16
  features[121] = oppPieceCount / 16

  // Pawn structure: count doubled/isolated pawns (simplified)
  let ownPawnFiles = new Set<number>()
  let ownPawnCount = 0
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const p = board[r][f]
      if (p && p.type === 'p' && p.color === botColor) {
        ownPawnFiles.add(f)
        ownPawnCount++
      }
    }
  }
  features[122] = ownPawnCount / 8
  features[123] = ownPawnFiles.size / 8 // File coverage (isolated pawn indicator)

  // King safety: how many pieces near our king
  const kingSquares = chess.board().flat().filter(p => p && p.type === 'k' && p.color === botColor)
  if (kingSquares.length > 0) {
    features[124] = 0.5 // placeholder king safety metric
  }

  // Eval sign indicator
  features[125] = centipawns > 0 ? 1 : centipawns < 0 ? 0 : 0.5

  // Features 126-127 reserved
  features[126] = 0
  features[127] = 0

  return features
}

export const FEATURE_DIM = 128
