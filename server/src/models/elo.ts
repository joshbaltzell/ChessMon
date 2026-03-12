const K = 32

export function calculateEloChange(
  playerElo: number,
  opponentElo: number,
  result: '1-0' | '0-1' | '1/2-1/2',
  playerIsWhite: boolean,
): number {
  let score: number
  if (result === '1/2-1/2') {
    score = 0.5
  } else if ((result === '1-0' && playerIsWhite) || (result === '0-1' && !playerIsWhite)) {
    score = 1
  } else {
    score = 0
  }

  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
  return Math.round(K * (score - expected))
}
