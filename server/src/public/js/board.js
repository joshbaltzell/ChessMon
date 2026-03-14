/* ============================================================
   ChessMon — Interactive Board Renderer
   ============================================================ */

// --- Piece unicode maps ---
const PIECE_UNICODE = {
  wk:'\u2654', wq:'\u2655', wr:'\u2656', wb:'\u2657', wn:'\u2658', wp:'\u2659',
  bk:'\u265A', bq:'\u265B', br:'\u265C', bb:'\u265D', bn:'\u265E', bp:'\u265F'
};
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

function renderInteractiveBoard(chess, boardId, options = {}) {
  const {
    interactive = false,
    flipped = false,
    selectedSq = null,
    legalMoves = [],
    lastFrom = null,
    lastTo = null,
    suggestedFrom = null,
    suggestedTo = null,
    onSquareClick = null,
  } = options;

  const board = document.getElementById(boardId);
  board.innerHTML = '';

  const rankOrder = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
  const fileOrder = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  // Detect check
  let kingInCheckSq = null;
  if (chess.isCheck()) {
    const turn = chess.turn();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + RANKS[r];
        const piece = chess.get(sq);
        if (piece && piece.type === 'k' && piece.color === turn) {
          kingInCheckSq = sq;
        }
      }
    }
  }

  const legalTargets = new Set(legalMoves.map(m => m.to));
  const captureTargets = new Set(legalMoves.filter(m => m.captured || m.flags.includes('e')).map(m => m.to));

  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      const rank = rankOrder[ri];
      const file = fileOrder[fi];
      const sq = FILES[file] + RANKS[rank];
      const isLight = (file + rank) % 2 === 1;

      const div = document.createElement('div');
      div.className = 'chess-square ' + (isLight ? 'light' : 'dark');
      div.dataset.square = sq;

      if (sq === lastFrom || sq === lastTo) div.classList.add('last-move');
      if (sq === selectedSq) div.classList.add('selected');
      if (legalTargets.has(sq)) {
        div.classList.add(captureTargets.has(sq) ? 'legal-capture' : 'legal-move');
      }
      if (sq === kingInCheckSq) div.classList.add('in-check');
      if (sq === suggestedFrom || sq === suggestedTo) div.classList.add('suggested-move');

      const piece = chess.get(sq);
      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece ' + (piece.color === 'w' ? 'white' : 'black');
        const key = piece.color + piece.type;
        span.textContent = PIECE_UNICODE[key] || '?';
        div.appendChild(span);
      }

      if (interactive && onSquareClick) {
        div.addEventListener('click', () => onSquareClick(sq));
      }

      board.appendChild(div);
    }
  }

  // Update coordinate labels
  const prefix = boardId === 'playBoard' ? 'play' :
                 boardId === 'pilotBoard' ? 'pilot' :
                 boardId === 'sparAnimBoard' ? 'sparAnim' : 'replay';
  const rankLabels = document.getElementById(prefix + 'RankLabels');
  const fileLabels = document.getElementById(prefix + 'FileLabels');
  if (rankLabels) {
    rankLabels.innerHTML = rankOrder.map(r => `<span>${RANKS[r]}</span>`).join('');
  }
  if (fileLabels) {
    fileLabels.innerHTML = fileOrder.map(f => `<span>${FILES[f]}</span>`).join('');
  }
}
