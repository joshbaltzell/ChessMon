/* ============================================================
   ChessMon — Pilot Mode (Play AS your bot vs system opponent)
   ============================================================ */

let pilotSession = null;
let pilotChess = null;
let pilotLastFrom = null;
let pilotLastTo = null;
let pilotFlipped = false;
let pilotWaiting = false;
let pilotColor = 'w';
let pilotOpponentLevel = 1;
let pilotSuggestedMove = null;
let pilotLastPgn = null;

// Board controller (shared logic from board.js)
const pilotBoard = createBoardController({
  getChess: () => pilotChess,
  getColor: () => pilotColor,
  isWaiting: () => pilotWaiting,
  boardId: 'pilotBoard',
  overlayId: 'pilotPromoOverlay',
  isFlipped: () => pilotFlipped,
  getLastMove: () => ({ from: pilotLastFrom, to: pilotLastTo }),
  onExecuteMove: executePilotMove,
  getSuggested: () => {
    if (!pilotSuggestedMove || !pilotChess || pilotChess.turn() !== pilotColor) return null;
    try {
      const testChess = new Chess(pilotChess.fen());
      const move = testChess.move(pilotSuggestedMove);
      if (move) return { from: move.from, to: move.to };
    } catch {}
    return null;
  },
});

function renderPilotBoard() { pilotBoard.render(); }

async function executePilotMove(san) {
  pilotWaiting = true;
  pilotBoard.deselect();
  document.getElementById('pilotStatus').textContent = 'Sending move...';

  try {
    const r = await api('POST', `/bots/${currentBotId}/pilot/${pilotSession}/move`, {
      move: san,
      opponent_level: pilotOpponentLevel,
    });

    pilotChess = new Chess();
    if (r.pgn) pilotChess.loadPgn(r.pgn);

    const history = pilotChess.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      pilotLastFrom = last.from;
      pilotLastTo = last.to;
    }

    pilotSuggestedMove = r.suggestedMove || null;

    if (r.status === 'complete') {
      pilotWaiting = true;
      pilotLastPgn = r.pgn;
      renderPilotBoard();
      showPilotResult(r);
      pilotSession = null;
    } else {
      pilotWaiting = false;
      renderPilotBoard();
      const oppMove = r.opponentMove || '?';
      let statusText = `Opponent played: ${oppMove}. Your turn.`;
      if (pilotSuggestedMove) {
        statusText += ` (Book suggests: ${pilotSuggestedMove})`;
      }
      document.getElementById('pilotStatus').textContent = statusText;
    }
  } catch(e) {
    pilotWaiting = false;
    renderPilotBoard();
    document.getElementById('pilotStatus').textContent = 'Error: ' + e.message;
  }
}

function showPilotResult(r) {
  const resultText = r.result === '1-0' ? 'White wins!' : r.result === '0-1' ? 'Black wins!' : 'Draw!';
  const cls = r.botWon ? 'win' : r.result === '1/2-1/2' ? 'draw' : 'loss';

  log(`Pilot game: ${resultText} (${r.botWon ? 'Victory' : 'Defeat'})`, cls);

  let html = `<strong>Game over — ${resultText}</strong>`;
  html += `<br>XP gained: +${r.xpGain} (1.5x pilot bonus)`;
  html += `<br>Elo change: ${r.eloChange >= 0 ? '+' : ''}${r.eloChange}`;
  if (r.mlTraining) {
    html += `<br>🧠 ${r.mlTraining.message}`;
  }
  document.getElementById('pilotStatus').innerHTML = html;

  document.getElementById('pilotPlayControls').innerHTML = `
    <button class="secondary" onclick="closePilot()">Close</button>
    <button class="secondary" onclick="replayPilotGame()">Replay</button>
    <button onclick="startPilotSetup()">Play Again</button>
  `;
}

function startPilotSetup() {
  document.getElementById('pilotSetupPanel').classList.remove('hidden');
  document.getElementById('pilotPlayPanel').classList.add('hidden');
}

async function beginPilotGame(color) {
  pilotColor = color;
  pilotFlipped = (color === 'b');
  pilotOpponentLevel = parseInt(document.getElementById('pilotOpponentLevel').value) || 1;

  document.getElementById('pilotSetupPanel').classList.add('hidden');

  try {
    const r = await api('POST', `/bots/${currentBotId}/pilot/new`, {
      player_color: pilotColor,
      opponent_level: pilotOpponentLevel,
    });

    pilotSession = r.sessionId;
    pilotChess = new Chess();
    if (r.pgn) pilotChess.loadPgn(r.pgn);

    pilotLastFrom = null;
    pilotLastTo = null;
    const history = pilotChess.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      pilotLastFrom = last.from;
      pilotLastTo = last.to;
    }

    pilotWaiting = false;
    pilotSuggestedMove = r.suggestedMove || null;

    document.getElementById('pilotPlayPanel').classList.remove('hidden');
    document.getElementById('pilotPlayControls').innerHTML =
      '<button class="danger" onclick="resignPilotGame()">Resign</button>';

    renderPilotBoard();

    let statusText = `Piloting as ${color === 'w' ? 'White' : 'Black'} vs Level ${pilotOpponentLevel} opponent.`;
    if (pilotSuggestedMove) {
      statusText += ` Book suggests: ${pilotSuggestedMove}`;
    }
    document.getElementById('pilotStatus').textContent = statusText;
    log(`Started pilot game vs Level ${pilotOpponentLevel}. You play ${color === 'w' ? 'White' : 'Black'}.`, 'info');
  } catch(e) {
    log('Pilot error: ' + e.message, 'loss');
    document.getElementById('pilotSetupPanel').classList.remove('hidden');
  }
}

async function resignPilotGame() {
  if (!pilotSession) return;
  try {
    const r = await api('POST', `/bots/${currentBotId}/pilot/${pilotSession}/resign`, {
      opponent_level: pilotOpponentLevel,
    });
    log(`Pilot game resigned. +${r.xpGain} XP.`, 'loss');
    pilotSession = null;
    pilotChess = null;
    closePilot();
  } catch(e) {
    log('Resign error: ' + e.message, 'loss');
  }
}

function closePilot() {
  document.getElementById('pilotPlayPanel').classList.add('hidden');
  document.getElementById('pilotSetupPanel').classList.remove('hidden');
  pilotChess = null;
  pilotSession = null;
  if (typeof showScreen === 'function') {
    showScreen('home');
  }
}

function replayPilotGame() {
  if (pilotLastPgn && typeof startReplay === 'function') {
    startReplay(pilotLastPgn);
  }
}
