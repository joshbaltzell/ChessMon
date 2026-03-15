/* ============================================================
   ChessMon — Play vs Bot (Click-to-move)
   ============================================================ */

// --- Play state ---
let playSession = null;
let clientChess = null;
let lastMoveFrom = null;
let lastMoveTo = null;
let boardFlipped = false;
let waitingForBot = false;
let playerColor = 'w';
let lastPlayPgn = null;

// Board controller (shared logic from board.js)
const playBoard = createBoardController({
  getChess: () => clientChess,
  getColor: () => playerColor,
  isWaiting: () => waitingForBot,
  boardId: 'playBoard',
  overlayId: 'promoOverlay',
  isFlipped: () => boardFlipped,
  getLastMove: () => ({ from: lastMoveFrom, to: lastMoveTo }),
  onExecuteMove: executeMove,
});

function renderPlayBoard() { playBoard.render(); }

async function executeMove(san) {
  waitingForBot = true;
  playBoard.deselect();
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
  if (typeof showScreen === 'function') {
    showScreen('home');
  }
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
  if (typeof closeFloatingPanels === 'function') closeFloatingPanels();
  if (!window.Chess) {
    log('Chess engine still loading, please wait...', 'dim');
    return;
  }
  document.getElementById('colorPickPanel').classList.remove('hidden');
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

    waitingForBot = false;

    resetPlayControls();
    document.getElementById('playPanel').classList.remove('hidden');
    if (typeof closeFloatingPanels === 'function') closeFloatingPanels();
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
    if (typeof showScreen === 'function') {
      showScreen('home');
    }
  } catch(e) { log('Resign error: ' + e.message, 'loss'); }
}
