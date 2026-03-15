/* ============================================================
   ChessMon — Opening Explorer
   Browse opening book positions interactively.
   ============================================================ */

let explorerChess = null;
let explorerPositions = {};  // FEN prefix → recommended SAN move
let explorerHistory = [];
let explorerProficiency = 0;
let explorerSelected = null; // selected square for click-to-move

function openExplorer(tacticKey, name, positions, proficiency) {
  explorerPositions = positions;
  explorerChess = new Chess();
  explorerHistory = [];
  explorerProficiency = proficiency;
  explorerSelected = null;

  document.getElementById('explorerTitle').textContent = name;
  document.getElementById('openingExplorerPanel').classList.remove('hidden');
  renderExplorerBoard();
}

function closeOpeningExplorer() {
  document.getElementById('openingExplorerPanel').classList.add('hidden');
  explorerChess = null;
  explorerPositions = {};
  explorerHistory = [];
  explorerSelected = null;
}

function getExplorerFenPrefix(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function getExplorerBookMove() {
  if (!explorerChess) return null;
  const fenPrefix = getExplorerFenPrefix(explorerChess.fen());
  return explorerPositions[fenPrefix] || null;
}

function renderExplorerBoard() {
  if (!explorerChess) return;

  const bookMove = getExplorerBookMove();

  // Parse book move to get from/to for highlighting
  let suggestedFrom = null, suggestedTo = null;
  if (bookMove) {
    try {
      const testChess = new Chess(explorerChess.fen());
      const m = testChess.move(bookMove);
      if (m) { suggestedFrom = m.from; suggestedTo = m.to; }
    } catch { /* ignore */ }
  }

  renderInteractiveBoard(explorerChess, 'explorerBoard', {
    interactive: false,
    flipped: false,
    lastFrom: suggestedFrom,
    lastTo: suggestedTo,
    highlightClass: 'book-move',
  });

  updateExplorerBreadcrumb();
  updateExplorerControls(bookMove);
  updateExplorerInfo();
}

function updateExplorerBreadcrumb() {
  const el = document.getElementById('explorerBreadcrumb');
  if (!el) return;
  if (explorerHistory.length === 0) {
    el.textContent = 'Starting position';
  } else {
    el.textContent = explorerHistory.map((san, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      return i % 2 === 0 ? `${moveNum}. ${san}` : san;
    }).join(' ');
  }
}

function updateExplorerControls(bookMove) {
  const el = document.getElementById('explorerControls');
  if (!el) return;
  let html = '';

  if (bookMove) {
    html += `<span class="explorer-book-move">Book move: <strong>${bookMove}</strong></span> `;
    html += `<button class="secondary" onclick="playExplorerMove('${bookMove}')">Play Book Move</button> `;
  } else if (!explorerChess.isGameOver()) {
    html += `<span style="color:var(--text-dim);font-size:0.8rem">No book move for this position</span> `;
  }

  if (explorerHistory.length > 0) {
    html += `<button class="secondary" onclick="undoExplorerMove()">← Undo</button> `;
    html += `<button class="secondary" onclick="resetExplorer()">Reset</button>`;
  }

  el.innerHTML = html;
}

function updateExplorerInfo() {
  const el = document.getElementById('explorerInfo');
  if (!el) return;
  const totalPositions = Object.keys(explorerPositions).length;
  el.innerHTML = `<span style="font-size:0.75rem;color:var(--text-dim)">Proficiency: ${explorerProficiency}% · ${totalPositions} book positions</span>`;
}

function playExplorerMove(san) {
  if (!explorerChess) return;
  try {
    explorerChess.move(san);
    explorerHistory.push(san);
    explorerSelected = null;
    renderExplorerBoard();
  } catch { /* invalid move */ }
}

function undoExplorerMove() {
  if (!explorerChess || explorerHistory.length === 0) return;
  explorerChess.undo();
  explorerHistory.pop();
  explorerSelected = null;
  renderExplorerBoard();
}

function resetExplorer() {
  if (!explorerChess) return;
  explorerChess = new Chess();
  explorerHistory = [];
  explorerSelected = null;
  renderExplorerBoard();
}

async function openOpeningExplorer(tacticKey) {
  if (!currentBotId || !authToken) return;
  try {
    const res = await fetch(`/api/v1/bots/${currentBotId}/openings/${tacticKey}`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    if (!res.ok) {
      const err = await res.json();
      log(err.error || 'Failed to load opening', 'error');
      return;
    }
    const data = await res.json();
    openExplorer(data.key, data.name, data.positions, data.proficiency);
  } catch (err) {
    log('Failed to load opening: ' + err.message, 'error');
  }
}
