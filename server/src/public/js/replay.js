/* ============================================================
   ChessMon — Game Replay + Spar Animation
   ============================================================ */

// --- Replay state ---
let replayChess = null;
let replayMoves = [];
let replayIndex = 0;
let lastSparPgn = null;
let replayAutoTimer = null;

// --- Spar animation state ---
let sparAnimTimer = null;
let sparAnimChess = null;
let sparAnimMoves = [];
let sparAnimIndex = 0;

// ===================================================================
// Spar Animation — fast "live game" feel
// ===================================================================
function startSparAnim(pgn, opponentName, resultLabel, botWon) {
  if (sparAnimTimer) { clearInterval(sparAnimTimer); sparAnimTimer = null; }

  const tempChess = new Chess();
  tempChess.loadPgn(pgn);
  sparAnimMoves = tempChess.history({ verbose: true });
  sparAnimChess = new Chess();
  sparAnimIndex = 0;

  document.getElementById('sparAnimTitle').textContent = `Sparring vs ${opponentName}...`;
  document.getElementById('sparAnimStatus').textContent = `Move 0 of ${sparAnimMoves.length}`;
  document.getElementById('sparAnimPanel').classList.remove('hidden');
  document.getElementById('playPanel').classList.add('hidden');
  document.getElementById('replayPanel').classList.add('hidden');
  setBoardActive(true);

  renderSparAnimBoard();

  sparAnimTimer = setInterval(() => {
    if (sparAnimIndex >= sparAnimMoves.length) {
      clearInterval(sparAnimTimer);
      sparAnimTimer = null;
      const cls = botWon ? 'color:var(--neon-green)' : 'color:var(--neon-pink)';
      document.getElementById('sparAnimTitle').innerHTML =
        `<span style="${cls}">${resultLabel}</span>`;
      document.getElementById('sparAnimStatus').textContent = 'Game complete';
      setTimeout(() => {
        if (!document.getElementById('sparAnimPanel').classList.contains('hidden')) {
          closeSparAnim();
        }
      }, 3000);
      return;
    }
    sparAnimChess.move(sparAnimMoves[sparAnimIndex].san);
    sparAnimIndex++;
    document.getElementById('sparAnimStatus').textContent =
      `Move ${sparAnimIndex} of ${sparAnimMoves.length}`;
    renderSparAnimBoard();
  }, 150);
}

function renderSparAnimBoard() {
  let lastFrom = null, lastTo = null;
  if (sparAnimIndex > 0) {
    const m = sparAnimMoves[sparAnimIndex - 1];
    lastFrom = m.from;
    lastTo = m.to;
  }
  renderInteractiveBoard(sparAnimChess, 'sparAnimBoard', {
    interactive: false,
    flipped: false,
    lastFrom, lastTo,
  });
}

function skipSparAnim() {
  if (sparAnimTimer) { clearInterval(sparAnimTimer); sparAnimTimer = null; }
  closeSparAnim();
}

function closeSparAnim() {
  if (sparAnimTimer) { clearInterval(sparAnimTimer); sparAnimTimer = null; }
  document.getElementById('sparAnimPanel').classList.add('hidden');
  setBoardActive(false);
  sparAnimChess = null;
  sparAnimMoves = [];
  sparAnimIndex = 0;
}

// ===================================================================
// Game Replay
// ===================================================================
function startReplay(pgn) {
  if (!window.Chess) {
    log('Chess engine still loading, please wait...', 'dim');
    return;
  }

  const tempChess = new Chess();
  tempChess.loadPgn(pgn);
  replayMoves = tempChess.history({ verbose: true });

  replayChess = new Chess();
  replayIndex = 0;

  document.getElementById('replayPanel').classList.remove('hidden');
  document.getElementById('playPanel').classList.add('hidden');
  setBoardActive(true);

  renderReplayBoard();
  renderReplayMoveList();
  updateReplayInfo();
}

function renderReplayBoard() {
  let lastFrom = null, lastTo = null;
  if (replayIndex > 0) {
    const m = replayMoves[replayIndex - 1];
    lastFrom = m.from;
    lastTo = m.to;
  }

  renderInteractiveBoard(replayChess, 'replayBoard', {
    interactive: false,
    flipped: false,
    lastFrom: lastFrom,
    lastTo: lastTo,
  });
}

function renderReplayMoveList() {
  const container = document.getElementById('replayMoveList');
  let html = '';
  for (let i = 0; i < replayMoves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = replayMoves[i];
    const blackMove = replayMoves[i + 1];
    html += `<span class="move-num">${moveNum}.</span> `;
    html += `<span class="move-san${replayIndex === i + 1 ? ' active' : ''}" onclick="replayGoTo(${i + 1})">${whiteMove.san}</span> `;
    if (blackMove) {
      html += `<span class="move-san${replayIndex === i + 2 ? ' active' : ''}" onclick="replayGoTo(${i + 2})">${blackMove.san}</span> `;
    }
  }
  container.innerHTML = html;

  const active = container.querySelector('.move-san.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function updateReplayInfo() {
  const total = replayMoves.length;
  document.getElementById('replayInfo').textContent =
    replayIndex === 0 ? 'Start position' :
    `Move ${replayIndex} of ${total}`;
}

function replayForward() {
  if (replayIndex >= replayMoves.length) return;
  const move = replayMoves[replayIndex];
  replayChess.move(move.san);
  replayIndex++;
  renderReplayBoard();
  renderReplayMoveList();
  updateReplayInfo();
}

function replayBack() {
  if (replayIndex <= 0) return;
  replayChess.undo();
  replayIndex--;
  renderReplayBoard();
  renderReplayMoveList();
  updateReplayInfo();
}

function replayGoTo(idx) {
  idx = Math.max(0, Math.min(idx, replayMoves.length));
  replayChess = new Chess();
  for (let i = 0; i < idx; i++) {
    replayChess.move(replayMoves[i].san);
  }
  replayIndex = idx;
  renderReplayBoard();
  renderReplayMoveList();
  updateReplayInfo();
}

function toggleReplayAuto() {
  if (replayAutoTimer) {
    clearInterval(replayAutoTimer);
    replayAutoTimer = null;
    document.getElementById('replayPlayBtn').innerHTML = '&#9654;';
  } else {
    document.getElementById('replayPlayBtn').innerHTML = '&#9646;&#9646;';
    replayAutoTimer = setInterval(() => {
      if (replayIndex >= replayMoves.length) {
        clearInterval(replayAutoTimer);
        replayAutoTimer = null;
        document.getElementById('replayPlayBtn').innerHTML = '&#9654;';
        return;
      }
      replayForward();
    }, 600);
  }
}

function closeReplay() {
  if (replayAutoTimer) { clearInterval(replayAutoTimer); replayAutoTimer = null; }
  document.getElementById('replayPanel').classList.add('hidden');
  setBoardActive(false);
  replayChess = null;
  replayMoves = [];
  replayIndex = 0;
}

// ===================================================================
// Keyboard support for replay
// ===================================================================
document.addEventListener('keydown', (e) => {
  if (document.getElementById('replayPanel').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); replayForward(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); replayBack(); }
  else if (e.key === 'Home') { e.preventDefault(); replayGoTo(0); }
  else if (e.key === 'End') { e.preventDefault(); replayGoTo(replayMoves.length); }
});
