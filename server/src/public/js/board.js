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

/**
 * Shared board interaction controller.
 * Eliminates duplicated click/select/promo logic between play.js and pilot.js.
 *
 * @param {Object} config
 * @param {() => Chess|null} config.getChess - Returns the current Chess instance
 * @param {() => string} config.getColor - Returns the player's color ('w'|'b')
 * @param {() => boolean} config.isWaiting - Whether waiting for opponent move
 * @param {string} config.boardId - DOM id of the board element
 * @param {string} config.overlayId - DOM id of the promo overlay element
 * @param {() => boolean} config.isFlipped - Whether the board is flipped
 * @param {(san: string) => void} config.onExecuteMove - Callback when a move is executed
 * @param {() => {from: string, to: string}|null} [config.getSuggested] - Optional suggested move
 * @param {() => {from: string|null, to: string|null}} config.getLastMove - Last move squares
 */
function createBoardController(config) {
  let selectedSquare = null;
  let legalMoves = [];

  function render() {
    const chess = config.getChess();
    if (!chess) return;
    const lastMove = config.getLastMove();
    const suggested = config.getSuggested ? config.getSuggested() : null;
    renderInteractiveBoard(chess, config.boardId, {
      interactive: true,
      flipped: config.isFlipped(),
      selectedSq: selectedSquare,
      legalMoves: legalMoves,
      lastFrom: lastMove.from,
      lastTo: lastMove.to,
      suggestedFrom: suggested ? suggested.from : null,
      suggestedTo: suggested ? suggested.to : null,
      onSquareClick: onSquareClick,
    });
  }

  function selectPiece(sq) {
    const chess = config.getChess();
    if (!chess) return;
    selectedSquare = sq;
    legalMoves = chess.moves({ square: sq, verbose: true });
    render();
  }

  function deselect() {
    selectedSquare = null;
    legalMoves = [];
    render();
  }

  function onSquareClick(sq) {
    if (config.isWaiting()) return;
    const chess = config.getChess();
    if (!chess) return;

    const piece = chess.get(sq);

    if (!selectedSquare) {
      if (piece && piece.color === config.getColor()) selectPiece(sq);
      return;
    }

    if (sq === selectedSquare) { deselect(); return; }
    if (piece && piece.color === config.getColor()) { selectPiece(sq); return; }

    const matching = legalMoves.filter(m => m.to === sq);
    if (matching.length === 0) { deselect(); return; }

    if (matching.some(m => m.promotion)) {
      showPromoPicker(sq, matching);
      return;
    }

    config.onExecuteMove(matching[0].san);
  }

  function showPromoPicker(toSq, moves) {
    const overlay = document.getElementById(config.overlayId);
    overlay.classList.remove('hidden');

    const color = config.getColor();
    const pieces = [
      { type: 'q', unicode: color === 'w' ? '\u2655' : '\u265B' },
      { type: 'r', unicode: color === 'w' ? '\u2656' : '\u265C' },
      { type: 'b', unicode: color === 'w' ? '\u2657' : '\u265D' },
      { type: 'n', unicode: color === 'w' ? '\u2658' : '\u265E' },
    ];

    // Store handler on overlay for cleanup
    overlay._promoHandler = function(san) {
      overlay.classList.add('hidden');
      if (san) config.onExecuteMove(san);
      else deselect();
    };

    overlay.innerHTML = pieces.map(p => {
      const move = moves.find(m => m.to === toSq && m.promotion === p.type);
      return `<div class="promo-choice" onclick="document.getElementById('${config.overlayId}')._promoHandler('${move ? move.san : ''}')">
        <span class="piece ${color === 'w' ? 'white' : 'black'}">${p.unicode}</span>
      </div>`;
    }).join('');
  }

  return { render, deselect, onSquareClick, selectPiece };
}
