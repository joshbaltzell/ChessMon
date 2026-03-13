/* ============================================================
   ChessMon — Play vs Bot (Click-to-move)
   ============================================================ */

// --- Play state ---
let playSession = null;
let clientChess = null;
let selectedSquare = null;
let legalMovesForSelected = [];
let lastMoveFrom = null;
let lastMoveTo = null;
let boardFlipped = false;
let waitingForBot = false;
let playerColor = 'w';
let lastPlayPgn = null;

function onPlaySquareClick(sq) {
  if (waitingForBot) return;
  if (!clientChess) return;

  const piece = clientChess.get(sq);

  if (!selectedSquare) {
    if (piece && piece.color === playerColor) selectPiece(sq);
    return;
  }

  if (sq === selectedSquare) { deselectPiece(); return; }
  if (piece && piece.color === playerColor) { selectPiece(sq); return; }

  const matchingMoves = legalMovesForSelected.filter(m => m.to === sq);
  if (matchingMoves.length === 0) { deselectPiece(); return; }

  if (matchingMoves.some(m => m.promotion)) {
    showPromotionPicker(sq, matchingMoves);
    return;
  }

  executeMove(matchingMoves[0].san);
}

function selectPiece(sq) {
  selectedSquare = sq;
  legalMovesForSelected = clientChess.moves({ square: sq, verbose: true });
  renderPlayBoard();
}

function deselectPiece() {
  selectedSquare = null;
  legalMovesForSelected = [];
  renderPlayBoard();
}

function renderPlayBoard() {
  renderInteractiveBoard(clientChess, 'playBoard', {
    interactive: true,
    flipped: boardFlipped,
    selectedSq: selectedSquare,
    legalMoves: legalMovesForSelected,
    lastFrom: lastMoveFrom,
    lastTo: lastMoveTo,
    onSquareClick: onPlaySquareClick,
  });
}

function showPromotionPicker(toSq, moves) {
  const overlay = document.getElementById('promoOverlay');
  overlay.classList.remove('hidden');

  const promoColor = playerColor;
  const pieces = [
    { type: 'q', unicode: promoColor === 'w' ? '\u2655' : '\u265B' },
    { type: 'r', unicode: promoColor === 'w' ? '\u2656' : '\u265C' },
    { type: 'b', unicode: promoColor === 'w' ? '\u2657' : '\u265D' },
    { type: 'n', unicode: promoColor === 'w' ? '\u2658' : '\u265E' },
  ];

  overlay.innerHTML = pieces.map(p => {
    const move = moves.find(m => m.to === toSq && m.promotion === p.type);
    return `<div class="promo-choice" onclick="onPromoSelect('${move ? move.san : ''}')">
      <span class="piece ${promoColor === 'w' ? 'white' : 'black'}">${p.unicode}</span>
    </div>`;
  }).join('');

  const board = document.getElementById('playBoard');
  const sqSize = board.offsetWidth / 8;
  const fileIdx = FILES.indexOf(toSq[0]);
  const rankIdx = RANKS.indexOf(toSq[1]);
  const visualFile = boardFlipped ? (7 - fileIdx) : fileIdx;
  const visualRank = boardFlipped ? rankIdx : (7 - rankIdx);
  overlay.style.left = (20 + visualFile * sqSize) + 'px';
  overlay.style.top = (visualRank * sqSize) + 'px';
}

function onPromoSelect(san) {
  document.getElementById('promoOverlay').classList.add('hidden');
  if (san) executeMove(san);
  else deselectPiece();
}

async function executeMove(san) {
  waitingForBot = true;
  deselectPiece();
  document.getElementById('playStatus').textContent = 'Sending move...';

  try {
    const r = await api('POST', `/bots/${currentBotId}/play/${playSession}/move`, { move: san });

    clientChess = new Chess();
    if (r.pgn) clientChess.loadPgn(r.pgn);

    const history = clientChess.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      lastMoveFrom = last.from;
      lastMoveTo = last.to;
    }

    if (r.status === 'complete') {
      waitingForBot = true;
      lastPlayPgn = r.pgn;
      renderPlayBoard();
      showGameOverControls(r.result, r.emotion);
      playSession = null;
    } else {
      waitingForBot = false;
      renderPlayBoard();
      const botMove = r.botMove || '?';
      document.getElementById('playStatus').textContent = `Bot played: ${botMove}. Your turn.`;
    }
  } catch(e) {
    waitingForBot = false;
    renderPlayBoard();
    document.getElementById('playStatus').textContent = 'Error: ' + e.message;
  }
}

// ===================================================================
// Game-over controls
// ===================================================================
function showGameOverControls(result, emotion) {
  const resultText = result === '1-0' ? 'White wins!' : result === '0-1' ? 'Black wins!' : 'Draw!';
  const playerWon = (result === '1-0' && playerColor === 'w') || (result === '0-1' && playerColor === 'b');
  const isDraw = result === '1/2-1/2';
  const cls = playerWon ? 'win' : isDraw ? 'draw' : 'loss';

  log(`Game finished: ${result}`, cls);

  let statusHtml = `<strong>Game over \u2014 ${resultText}</strong>`;
  if (emotion) {
    statusHtml += `<br>${emotion.face} "${escHtml(emotion.message)}"`;
  }
  document.getElementById('playStatus').innerHTML = statusHtml;

  const controls = document.getElementById('playControls');
  controls.innerHTML = `
    <button class="secondary" onclick="closePlay()">Close</button>
    <button class="secondary" onclick="replayLastPlay()">Replay</button>
    <button onclick="startPlay()">Play Again</button>
  `;
}

function resetPlayControls() {
  document.getElementById('playControls').innerHTML =
    '<button class="danger" onclick="resignGame()">Resign</button>';
}

function closePlay() {
  document.getElementById('playPanel').classList.add('hidden');
  setBoardActive(false);
  clientChess = null;
  playSession = null;
  refreshDashboard();
}

function replayLastPlay() {
  if (lastPlayPgn) {
    startReplay(lastPlayPgn);
  }
}

// ===================================================================
// Start / Resign Play
// ===================================================================
function startPlay() {
  closeFloatingPanels();
  if (!window.Chess) {
    log('Chess engine still loading, please wait...', 'dim');
    return;
  }
  document.getElementById('colorPickPanel').classList.remove('hidden');
  document.getElementById('colorPickPanel').scrollIntoView({ behavior: 'smooth' });
}

async function beginPlay(color) {
  document.getElementById('colorPickPanel').classList.add('hidden');
  playerColor = color;
  boardFlipped = (playerColor === 'b');

  try {
    const r = await api('POST', `/bots/${currentBotId}/play/new`, { player_color: playerColor });
    playSession = r.sessionId;

    clientChess = new Chess();
    if (r.pgn) clientChess.loadPgn(r.pgn);

    lastMoveFrom = null;
    lastMoveTo = null;
    const history = clientChess.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      lastMoveFrom = last.from;
      lastMoveTo = last.to;
    }

    selectedSquare = null;
    legalMovesForSelected = [];
    waitingForBot = false;

    resetPlayControls();
    document.getElementById('playPanel').classList.remove('hidden');
    document.getElementById('replayPanel').classList.add('hidden');
    setBoardActive(true);
    renderPlayBoard();

    const colorName = playerColor === 'w' ? 'White' : 'Black';
    document.getElementById('playStatus').textContent = `You play ${colorName}. ${playerColor === clientChess.turn() ? 'Your turn \u2014 click a piece.' : 'Waiting for bot...'}`;
    log(`Started game vs your bot. You play ${colorName}.`, 'info');
  } catch(e) { log('Play error: ' + e.message, 'loss'); }
}

async function resignGame() {
  if (!playSession) return;
  try {
    await fetch(API + `/bots/${currentBotId}/play/${playSession}/resign`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    });
    log('Resigned game.', 'loss');
    playSession = null;
    clientChess = null;
    document.getElementById('playPanel').classList.add('hidden');
    setBoardActive(false);
    await refreshDashboard();
  } catch(e) { log('Resign error: ' + e.message, 'loss'); }
}
