/**
 * Battle commentary — generates bot reactions to specific game moments.
 * These are short, personality-driven quips for match recaps.
 */

import type { CandidateMove, PositionRecord } from '../types/index.js'

export interface KeyMoment {
  moveNumber: number
  color: 'w' | 'b'
  move: string
  fen: string
  type: 'blunder' | 'brilliant' | 'sacrifice' | 'missed_mate' | 'turning_point' | 'opening_book'
  evalSwing: number   // centipawn swing (positive = good for the mover)
  commentary: string  // bot's reaction
}

export interface MatchRecap {
  summary: string
  keyMoments: KeyMoment[]
  botMood: string
  openingName: string | null
  longestThink: number | null  // move with most candidates considered
  favoriteMove: string | null  // the move the bot is proudest of
}

/**
 * Analyze a list of position records and generate a match recap.
 */
export function generateMatchRecap(
  positions: PositionRecord[],
  result: string,
  botColor: 'w' | 'b',
  alignmentAttack: string,
  alignmentStyle: string,
): MatchRecap {
  const keyMoments: KeyMoment[] = []
  let prevEval = 0
  let biggestSwingMove: { move: string; swing: number; moveNum: number } | null = null
  let openingName: string | null = null

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const moveNumber = Math.floor(i / 2) + 1
    const isBotMove = pos.color === botColor

    // Get eval from candidates
    const topEval = pos.candidateMoves[0]?.centipawns ?? 0
    const evalSwing = topEval - prevEval

    // Detect key moments
    if (pos.candidateMoves.length > 0) {
      const playedRank = pos.movePlayedUci
        ? pos.candidateMoves.findIndex(c => c.move === pos.movePlayedUci)
        : -1

      // Blunder: bot played a move ranked 3+ and lost significant eval
      if (isBotMove && playedRank >= 3 && Math.abs(evalSwing) > 100) {
        keyMoments.push({
          moveNumber, color: pos.color, move: pos.movePlayed, fen: pos.fen,
          type: 'blunder', evalSwing,
          commentary: getBlunderComment(alignmentAttack, alignmentStyle),
        })
      }

      // Brilliant: bot played the top move with big eval gain
      if (isBotMove && playedRank === 0 && evalSwing > 150) {
        keyMoments.push({
          moveNumber, color: pos.color, move: pos.movePlayed, fen: pos.fen,
          type: 'brilliant', evalSwing,
          commentary: getBrilliantComment(alignmentAttack, alignmentStyle),
        })
      }

      // Sacrifice detection: bot captured nothing but lost material eval, yet position improved
      if (isBotMove && pos.movePlayed.includes('x') === false && evalSwing < -100 && playedRank <= 1) {
        // Check if this is a sacrifice (intentional material loss for position)
        keyMoments.push({
          moveNumber, color: pos.color, move: pos.movePlayed, fen: pos.fen,
          type: 'sacrifice', evalSwing,
          commentary: getSacrificeComment(alignmentAttack, alignmentStyle),
        })
      }

      // Turning point: biggest eval swing in the game
      if (Math.abs(evalSwing) > (biggestSwingMove?.swing ?? 0)) {
        biggestSwingMove = { move: pos.movePlayed, swing: Math.abs(evalSwing), moveNum: moveNumber }
      }

      // Missed mate
      if (pos.candidateMoves[0]?.mate !== null && playedRank > 0) {
        keyMoments.push({
          moveNumber, color: pos.color, move: pos.movePlayed, fen: pos.fen,
          type: 'missed_mate', evalSwing: 0,
          commentary: getMissedMateComment(alignmentAttack, isBotMove),
        })
      }
    }

    prevEval = topEval
  }

  // Add turning point if significant
  if (biggestSwingMove && biggestSwingMove.swing > 200 && keyMoments.length < 5) {
    keyMoments.push({
      moveNumber: biggestSwingMove.moveNum,
      color: positions[(biggestSwingMove.moveNum - 1) * 2]?.color ?? 'w',
      move: biggestSwingMove.move,
      fen: '',
      type: 'turning_point',
      evalSwing: biggestSwingMove.swing,
      commentary: getTurningPointComment(alignmentAttack),
    })
  }

  // Sort by move number, keep top 5
  keyMoments.sort((a, b) => a.moveNumber - b.moveNumber)
  const topMoments = keyMoments.slice(0, 5)

  // Find favorite move (best brilliant moment, or top candidate move the bot played)
  const brilliantMoment = topMoments.find(m => m.type === 'brilliant')
  const favoriteMove = brilliantMoment?.move ?? null

  // Generate summary
  const botWon = (result === '1-0' && botColor === 'w') || (result === '0-1' && botColor === 'b')
  const botLost = (result === '1-0' && botColor === 'b') || (result === '0-1' && botColor === 'w')
  const summary = generateSummary(botWon, botLost, positions.length, topMoments, alignmentAttack, alignmentStyle)

  return {
    summary,
    keyMoments: topMoments,
    botMood: botWon ? 'happy' : botLost ? 'determined' : 'neutral',
    openingName,
    longestThink: null,
    favoriteMove,
  }
}

function generateSummary(
  won: boolean, lost: boolean, totalMoves: number,
  moments: KeyMoment[], attack: string, style: string,
): string {
  const moveCount = Math.ceil(totalMoves / 2)
  const blunders = moments.filter(m => m.type === 'blunder').length
  const brilliances = moments.filter(m => m.type === 'brilliant').length
  const sacrifices = moments.filter(m => m.type === 'sacrifice').length

  let summary = ''

  if (won) {
    if (moveCount < 25) summary = 'A swift, decisive victory!'
    else if (brilliances > 0) summary = 'A brilliant win with flashes of genius!'
    else if (sacrifices > 0) summary = 'A daring win featuring bold sacrifices!'
    else summary = 'A hard-fought victory!'
  } else if (lost) {
    if (blunders > 1) summary = 'A rough game with some costly mistakes.'
    else if (moveCount > 60) summary = 'A long, grinding battle that slipped away.'
    else summary = 'A tough loss, but every defeat teaches something new.'
  } else {
    summary = 'A balanced draw — neither side could find the breakthrough.'
  }

  if (brilliances >= 2) summary += ' Multiple brilliant moves stood out.'
  if (blunders >= 2 && won) summary += ' Won despite some shaky moments!'

  return summary
}

// --- Commentary by personality ---

const BLUNDER_COMMENTS: Record<string, string[]> = {
  aggressive: [
    'Ugh! I got too hasty there!',
    'Okay, that was reckless even for me...',
    'My attack instincts betrayed me!',
  ],
  balanced: [
    'That wasn\'t my best moment...',
    'I miscalculated. Noted.',
    'Everyone stumbles sometimes.',
  ],
  defensive: [
    'A crack in my fortress! How?!',
    'I let my guard down...',
    'That weakness shouldn\'t have been there.',
  ],
}

const BRILLIANT_COMMENTS: Record<string, Record<string, string[]>> = {
  aggressive: {
    chaotic: ['BOOM! Didn\'t see THAT coming, did you?!', 'CHAOS BRILLIANCE!'],
    positional: ['Calculated aggression at its finest!', 'Set up the attack perfectly!'],
    sacrificial: ['The stars aligned for that sacrifice!', 'WORTH EVERY PIECE!'],
  },
  balanced: {
    chaotic: ['Hehe, even I\'m surprised that worked!', 'Accidentally genius!'],
    positional: ['Textbook brilliance!', 'Exactly as the masters would play.'],
    sacrificial: ['A calculated gamble that paid off!', 'Bold but precise!'],
  },
  defensive: {
    chaotic: ['My fortress has trap doors! Surprise!', 'Got you from behind the walls!'],
    positional: ['From defense to counterattack!', 'Patience rewarded with perfection.'],
    sacrificial: ['Sacrificed to seal the position — brilliant!', 'The wall stands stronger than ever!'],
  },
}

const SACRIFICE_COMMENTS: Record<string, string[]> = {
  aggressive: ['MATERIAL IS TEMPORARY! The attack is EVERYTHING!', 'All-in! No regrets!'],
  balanced: ['A calculated sacrifice... let\'s see if it pays off.', 'Sometimes you have to give to receive.'],
  defensive: ['Gave up a piece to build the perfect wall!', 'A small price for an unbreakable defense.'],
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getBlunderComment(attack: string, _style: string): string {
  return pick(BLUNDER_COMMENTS[attack] || BLUNDER_COMMENTS.balanced)
}

function getBrilliantComment(attack: string, style: string): string {
  const attackComments = BRILLIANT_COMMENTS[attack] || BRILLIANT_COMMENTS.balanced
  const styleComments = attackComments[style] || attackComments.positional || Object.values(attackComments)[0]
  return pick(styleComments)
}

function getSacrificeComment(attack: string, _style: string): string {
  return pick(SACRIFICE_COMMENTS[attack] || SACRIFICE_COMMENTS.balanced)
}

function getMissedMateComment(attack: string, isBotMove: boolean): string {
  if (isBotMove) {
    return pick([
      'I missed a checkmate there! So frustrating!',
      'Wait... was that mate?! Nooo!',
      'The winning move was RIGHT THERE!',
    ])
  }
  return pick([
    'Phew! They missed a forced mate!',
    'Lucky break — they had mate and didn\'t see it!',
    'Survived by the skin of my teeth!',
  ])
}

function getTurningPointComment(attack: string): string {
  return pick([
    'This is where everything changed!',
    'The critical moment of the game!',
    'One move that shifted the entire battle!',
    'This was the turning point — the position transformed completely!',
  ])
}
