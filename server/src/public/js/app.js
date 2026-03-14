/* ============================================================
   ChessMon — Main Application (Orchestration, Auth, API, State)
   ============================================================ */

const API = '/api/v1';
let token = null;
let currentBotId = null;
let sparInProgress = false;
let previousElo = null;

// Store last dashboard data globally for hand.js access
window._lastDashboard = null;

// ===================================================================
// API helper
// ===================================================================
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(API + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

// ===================================================================
// Health check
// ===================================================================
async function checkHealth() {
  try {
    const h = await api('GET', '/health');
    document.getElementById('statusDot').className = 'status-dot ok';
    document.getElementById('statusText').textContent =
      `Server OK \u2014 Stockfish: ${h.stockfish.totalWorkers} workers, ${h.stockfish.busyWorkers} busy`;
  } catch(e) {
    document.getElementById('statusDot').className = 'status-dot err';
    document.getElementById('statusText').textContent = 'Server unreachable: ' + e.message;
  }
}

// ===================================================================
// Auth
// ===================================================================
async function doAuth(action) {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  if (!u || !p) { document.getElementById('authErr').textContent = 'Username and password required'; return; }
  try {
    const data = await api('POST', `/auth/${action}`, { username: u, password: p });
    token = data.token;
    document.getElementById('authErr').textContent = '';
    document.getElementById('authPanel').classList.add('hidden');
    log(`Logged in as ${data.player.username}`, 'info');
    loadBots();
  } catch(e) {
    document.getElementById('authErr').textContent = e.message;
  }
}

// ===================================================================
// Bot list
// ===================================================================
async function loadBots() {
  const resp = await api('GET', '/bots/mine');
  const bots = resp.bots || resp;
  const panel = document.getElementById('botSelectPanel');
  const list = document.getElementById('botList');
  if (bots.length === 0) {
    panel.classList.add('hidden');
    document.getElementById('createBotPanel').classList.remove('hidden');
    return;
  }
  panel.classList.remove('hidden');
  list.innerHTML = bots.map(b =>
    `<button style="margin:4px" onclick="selectBot(${b.id})">${b.name} \u2014 Lv.${b.level} (${b.elo} elo)</button>`
  ).join('') + (bots.length < 3 ? '<button class="secondary" style="margin:4px" onclick="showCreateBot()">+ New Bot</button>' : '');
}

function showCreateBot() {
  document.getElementById('createBotPanel').classList.remove('hidden');
}

// ===================================================================
// Attribute sliders
// ===================================================================
const ATTRS = ['aggression','positional','tactical','endgame','creativity'];
const ATTR_INFO = {
  aggression: {
    label: 'Aggression',
    desc: 'Prefers captures, checks & forcing moves. At 15+: immune to blunders when a forcing move exists.',
    icon: '\u2694\uFE0F',
  },
  positional: {
    label: 'Positional',
    desc: 'Trusts engine\u2019s top evaluation for solid play. At 15+: searches 1 move deeper, fewer blunders.',
    icon: '\u265F',
  },
  tactical: {
    label: 'Tactical',
    desc: 'Finds combinations and tactical shots. At 15+: searches 1 move deeper, fewer blunders.',
    icon: '\u26A1',
  },
  endgame: {
    label: 'Endgame',
    desc: 'Dominates when pieces come off. At 15+: searches 1 extra move deep in endgames.',
    icon: '\uD83D\uDC51',
  },
  creativity: {
    label: 'Creativity',
    desc: 'Picks surprising moves opponents can\u2019t predict. At 15+: learns faster from training games.',
    icon: '\uD83C\uDFB2',
  },
};

function initSliders() {
  const container = document.getElementById('attrSliders');
  ATTRS.forEach(a => {
    const info = ATTR_INFO[a];
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.innerHTML = `<span>${info.icon} ${info.label}</span><input type="range" min="0" max="20" value="10" id="attr_${a}" oninput="updatePts()"><span class="val" id="val_${a}">10</span>`;
    container.appendChild(row);
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.72rem;color:var(--text-dim);margin:-2px 0 6px 98px;line-height:1.3';
    desc.textContent = info.desc;
    container.appendChild(desc);
  });
  updatePts();
}

function updatePts() {
  let sum = 0;
  ATTRS.forEach(a => {
    const v = parseInt(document.getElementById('attr_'+a).value);
    document.getElementById('val_'+a).textContent = v;
    sum += v;
  });
  const el = document.getElementById('ptsLeft');
  const left = 50 - sum;
  el.textContent = `(${left} pts left)`;
  el.className = 'pts-left' + (left < 0 ? ' over' : '');
  document.getElementById('createBotBtn').disabled = left !== 0;
}

// ===================================================================
// Create bot
// ===================================================================
async function createBot() {
  const name = document.getElementById('botName').value.trim();
  if (!name) { document.getElementById('createErr').textContent = 'Bot name required'; return; }
  const body = { name, alignment_attack: document.getElementById('atkAlign').value, alignment_style: document.getElementById('styleAlign').value };
  ATTRS.forEach(a => body[a] = parseInt(document.getElementById('attr_'+a).value));
  try {
    const data = await api('POST', '/bots', body);
    document.getElementById('createBotPanel').classList.add('hidden');
    document.getElementById('createErr').textContent = '';
    log(`Created bot "${data.bot.name}"!`, 'info');
    selectBot(data.bot.id);
    loadBots();
  } catch(e) {
    document.getElementById('createErr').textContent = e.message;
  }
}

// ===================================================================
// Select & Dashboard
// ===================================================================
async function selectBot(id) {
  currentBotId = id;
  document.getElementById('dashPanel').classList.remove('hidden');
  document.getElementById('logPanel').classList.remove('hidden');
  await refreshDashboard();
}

async function refreshDashboard() {
  const spinner = document.getElementById('actionSpinner');
  if (spinner) spinner.style.display = 'none';

  const d = await api('GET', `/bots/${currentBotId}/dashboard`);
  window._lastDashboard = d;

  // Render terrarium (bot enclosure with aura, mood, attrs)
  if (typeof renderTerrarium === 'function') {
    renderTerrarium(d);
  }

  // Render ladder if available
  if (typeof renderLadder === 'function') {
    renderLadder(d);
  }

  // Show quick spar area when dashboard is visible
  const quickSparArea = document.getElementById('quickSparArea');
  if (quickSparArea) quickSparArea.classList.remove('hidden');

  // Update streak display
  const streakEl = document.getElementById('streakDisplay');
  if (streakEl) {
    if (d.streak >= 3) {
      streakEl.innerHTML = `🔥 Streak: ${d.streak}x`;
      streakEl.classList.add('hot-streak');
    } else if (d.streak > 0) {
      streakEl.innerHTML = `Streak: ${d.streak}x`;
      streakEl.classList.remove('hot-streak');
    } else {
      streakEl.innerHTML = '';
      streakEl.classList.remove('hot-streak');
    }
  }

  // Track elo for milestone detection
  if (previousElo === null) previousElo = d.stats.elo;

  // Show context cue
  if (d.contextCues) {
    log(d.contextCues.text, 'info');
  }

  const acts = document.getElementById('dashActions');
  const pts = d.training.pointsRemaining;
  acts.innerHTML = `
    <button class="green" onclick="doLevelTest()">Level Test</button>
    ${lastSparPgn ? '<button class="secondary" onclick="startReplay(lastSparPgn)">Replay Last Spar</button>' : ''}
    <button class="secondary" onclick="showBotBrain()">Bot Brain</button>
    <button class="secondary" onclick="refreshDashboard()">Refresh</button>
  `;

  // Display card hand
  if (d.hand && typeof displayHand === 'function') {
    displayHand(d.hand);
  }
}

// ===================================================================
// Action button loading states
// ===================================================================
function disableActions(msg) {
  const acts = document.getElementById('dashActions');
  acts.querySelectorAll('button').forEach(b => b.disabled = true);
  let spinner = document.getElementById('actionSpinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'actionSpinner';
    spinner.style.cssText = 'font-size:0.85rem;color:var(--neon-yellow);margin:6px 0;';
    acts.parentElement.insertBefore(spinner, acts.nextSibling);
  }
  spinner.textContent = '\u23F3 ' + msg;
  spinner.style.display = '';
}

function enableActions() {
  const acts = document.getElementById('dashActions');
  acts.querySelectorAll('button').forEach(b => b.disabled = false);
  const spinner = document.getElementById('actionSpinner');
  if (spinner) spinner.style.display = 'none';
}

// ===================================================================
// Bot Brain — ML insights
// ===================================================================
async function showBotBrain() {
  if (!currentBotId) return;
  closeFloatingPanels();

  const panel = document.getElementById('brainPanel');
  const content = document.getElementById('brainContent');
  content.innerHTML = '<span class="dim">Analyzing neural network...</span>';
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth' });

  try {
    const r = await api('GET', `/bots/${currentBotId}/brain`);
    if (!r.trained) {
      content.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-dim)">
        <div style="font-size:2rem;margin-bottom:8px">( &bull;_&bull;)</div>
        <div>No training data yet.</div>
        <div style="margin-top:4px">Spar against opponents to start building your bot's brain!</div>
      </div>`;
      return;
    }

    const p = r.profile;

    function bar(value, color, maxW) {
      const w = Math.max(2, Math.round(Math.abs(value) * (maxW || 120)));
      return `<div style="display:inline-block;width:${w}px;height:12px;background:${color};border-radius:3px;vertical-align:middle"></div>`;
    }

    function pref(a, b, labelA, labelB) {
      const diff = a - b;
      const color = diff > 0.05 ? 'var(--neon-green)' : diff < -0.05 ? 'var(--neon-pink)' : 'var(--text-dim)';
      const winner = diff > 0.05 ? labelA : diff < -0.05 ? labelB : 'Neutral';
      return `<span style="color:${color}">${winner}</span> <span class="dim">(${(a*100).toFixed(0)}% vs ${(b*100).toFixed(0)}%)</span>`;
    }

    const phases = [
      { name: 'Opening', score: p.openingPlay, icon: '1' },
      { name: 'Midgame', score: p.midgamePlay, icon: '2' },
      { name: 'Endgame', score: p.endgamePlay, icon: '3' },
    ];
    const maxPhase = Math.max(...phases.map(ph => ph.score));

    content.innerHTML = `
      <div style="text-align:center;margin-bottom:12px">
        <span style="font-size:1.1rem;color:var(--neon-blue)">Neural Network Analysis</span>
        <span class="dim">(${r.gamesPlayed} games trained)</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">
        <div>
          <div style="color:var(--neon-blue);font-weight:bold;margin-bottom:6px">Move Preferences</div>
          <div class="brain-row">
            <span class="brain-label">Captures</span>
            ${bar(p.captures, 'var(--neon-pink)')} <span class="dim">${(p.captures*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Quiet Moves</span>
            ${bar(p.quietMoves, 'var(--neon-green)')} <span class="dim">${(p.quietMoves*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Checks</span>
            ${bar(p.checks, 'var(--neon-yellow)')} <span class="dim">${(p.checks*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Sacrifices</span>
            ${bar(p.sacrifices, 'var(--neon-purple)')} <span class="dim">${(p.sacrifices*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Center Control</span>
            ${bar(p.centerMoves, 'var(--neon-blue)')} <span class="dim">${(p.centerMoves*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Pawn Advances</span>
            ${bar(p.pawnAdvances, 'var(--neon-green)')} <span class="dim">${(p.pawnAdvances*100).toFixed(0)}%</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Castling</span>
            ${bar(p.castling, 'var(--neon-blue)')} <span class="dim">${(p.castling*100).toFixed(0)}%</span>
          </div>
        </div>

        <div>
          <div style="color:var(--neon-blue);font-weight:bold;margin-bottom:6px">Learned Tendencies</div>
          <div class="brain-row">
            <span class="brain-label">Style</span>
            ${pref(p.captures, p.quietMoves, 'Aggressive', 'Quiet')}
          </div>
          <div class="brain-row">
            <span class="brain-label">Engine Trust</span>
            ${pref(p.topEngineMoves, p.nonTopMoves, 'High', 'Low')}
          </div>
          <div class="brain-row">
            <span class="brain-label">Board Control</span>
            ${pref(p.centerMoves, p.edgeMoves, 'Central', 'Flanks')}
          </div>

          <div style="color:var(--neon-blue);font-weight:bold;margin:10px 0 6px">Phase Strength</div>
          ${phases.map(ph => `
            <div class="brain-row">
              <span class="brain-label">${ph.name}</span>
              ${bar(ph.score, ph.score === maxPhase ? 'var(--neon-green)' : 'var(--border)', 100)}
              <span class="dim">${(ph.score*100).toFixed(0)}%</span>
              ${ph.score === maxPhase ? ' <span style="color:var(--neon-green)">Best</span>' : ''}
            </div>
          `).join('')}

          <div style="color:var(--neon-blue);font-weight:bold;margin:10px 0 6px">Personality Scores</div>
          <div class="brain-row">
            <span class="brain-label">Aggression</span>
            <span style="color:${p.aggressiveness > 0.05 ? 'var(--neon-pink)' : p.aggressiveness < -0.05 ? 'var(--neon-green)' : 'var(--text-dim)'}">${p.aggressiveness > 0.05 ? 'High' : p.aggressiveness < -0.05 ? 'Low' : 'Moderate'}</span>
            <span class="dim">(${(p.aggressiveness*100).toFixed(0)})</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Engine Trust</span>
            <span style="color:${p.engineTrust > 0.05 ? 'var(--neon-blue)' : p.engineTrust < -0.05 ? 'var(--neon-yellow)' : 'var(--text-dim)'}">${p.engineTrust > 0.05 ? 'Trusting' : p.engineTrust < -0.05 ? 'Independent' : 'Balanced'}</span>
            <span class="dim">(${(p.engineTrust*100).toFixed(0)})</span>
          </div>
          <div class="brain-row">
            <span class="brain-label">Positional</span>
            <span style="color:${p.positionalPlay > 0.05 ? 'var(--neon-blue)' : p.positionalPlay < -0.05 ? 'var(--neon-yellow)' : 'var(--text-dim)'}">${p.positionalPlay > 0.05 ? 'Strong' : p.positionalPlay < -0.05 ? 'Weak' : 'Average'}</span>
            <span class="dim">(${(p.positionalPlay*100).toFixed(0)})</span>
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<span class="loss">Error: ${escHtml(e.message)}</span>`;
  }
}

// ===================================================================
// Close floating panels
// ===================================================================
function closeFloatingPanels() {
  document.getElementById('tacticShopPanel').classList.add('hidden');
  document.getElementById('sparPickPanel').classList.add('hidden');
  document.getElementById('colorPickPanel').classList.add('hidden');
  document.getElementById('brainPanel').classList.add('hidden');
  if (sparAnimTimer) closeSparAnim();
}

// ===================================================================
// Spar — opponent picker
// ===================================================================
const SYSTEM_BOTS = [
  { level:1, name:'Pawn Pusher', elo:400, description:'Pushes pawns eagerly \u2014 easy warm-up' },
  { level:2, name:'Knight Hopper', elo:500, description:'Loves jumping knights around the board' },
  { level:3, name:'Bishop Slider', elo:600, description:'Prefers diagonal play with bishops' },
  { level:4, name:'Rook Roller', elo:700, description:'Opens files for rook play' },
  { level:5, name:'Castle Guard', elo:800, description:'Castles early and defends the king' },
  { level:6, name:'Pin Master', elo:900, description:'Creates pins and skewers frequently' },
  { level:7, name:'Fork Finder', elo:1000, description:'Hunts for knight forks constantly' },
  { level:8, name:'Center Controller', elo:1100, description:'Fights fiercely for central squares' },
  { level:9, name:'File Opener', elo:1200, description:'Opens files and invades with heavy pieces' },
  { level:10, name:'Endgame Grinder', elo:1300, description:'Simplifies into winning endgames' },
  { level:11, name:'Tempo Hunter', elo:1400, description:'Gains tempo with every move' },
  { level:12, name:'Space Invader', elo:1500, description:'Grabs space and restricts opponent' },
  { level:13, name:'Quiet Assassin', elo:1600, description:'Strong quiet moves that build pressure' },
  { level:14, name:'Exchange Master', elo:1700, description:'Knows when to trade and when to keep pieces' },
  { level:15, name:'Prophylaxis Pro', elo:1800, description:'Prevents your plans before executing their own' },
  { level:16, name:'Calculation Engine', elo:1900, description:'Calculates deeply and accurately' },
  { level:17, name:'Positional Sage', elo:2000, description:'Deep positional understanding' },
  { level:18, name:'Tactical Storm', elo:2100, description:'Finds brilliant tactical shots' },
  { level:19, name:'Grandmaster Ghost', elo:2200, description:'Near-grandmaster strength' },
  { level:20, name:'Stockfish Ceiling', elo:2400, description:'Full engine strength \u2014 the ultimate test' },
];

async function showSparPicker() {
  closeFloatingPanels();
  const dash = await api('GET', `/bots/${currentBotId}/dashboard`);
  const botLevel = dash.stats.level;
  const botElo = dash.stats.elo;
  const panel = document.getElementById('sparPickPanel');
  const list = document.getElementById('sparOpponentList');

  const minLv = Math.max(1, botLevel - 1);
  const maxLv = Math.min(20, botLevel + 3);
  const opponents = SYSTEM_BOTS.filter(b => b.level >= minLv && b.level <= maxLv);

  list.innerHTML = opponents.map(o => {
    const diff = o.elo - botElo;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    const diffCls = diff > 100 ? 'color:var(--neon-pink)' : diff > 0 ? 'color:var(--neon-yellow)' : 'color:var(--neon-green)';
    const recommended = o.level === botLevel || o.level === botLevel + 1;
    return `<div class="tactic-card" style="cursor:pointer" onclick="doSpar(${o.level})">
      <div class="tactic-info">
        <div class="tactic-name">Lv.${o.level} ${escHtml(o.name)}${recommended ? ' \u2B50' : ''}</div>
        <div class="tactic-desc">${escHtml(o.description || '')}</div>
        <div class="tactic-meta">Elo ${o.elo} <span style="${diffCls}">(${diffStr} vs your bot)</span></div>
      </div>
    </div>`;
  }).join('');

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior:'smooth' });
}

async function doSpar(opponentLevel) {
  document.getElementById('sparPickPanel').classList.add('hidden');
  log(`Starting spar vs Lv.${opponentLevel} ${SYSTEM_BOTS[opponentLevel-1]?.name || 'Bot'}...`, 'dim');
  disableActions('Sparring...');
  try {
    const r = await api('POST', `/bots/${currentBotId}/train/spar`, { opponent: 'system', opponent_level: opponentLevel });
    const res = r.game.result;
    const cls = res === '1-0' && r.game.botPlayedWhite ? 'win' : res === '0-1' && !r.game.botPlayedWhite ? 'win' : res === '1/2-1/2' ? 'draw' : 'loss';
    const won = cls === 'win' ? 'WON' : cls === 'loss' ? 'LOST' : 'DREW';
    log(`Spar vs ${r.game.opponent}: ${won} in ${r.game.moveCount} moves (Elo ${r.eloChange >= 0 ? '+' : ''}${r.eloChange}, +${r.xpGained} XP)`, cls);
    if (r.recap && r.recap.keyMoments) {
      r.recap.keyMoments.slice(0, 3).forEach(m => {
        log(`  Move ${m.moveNumber}: ${m.move} \u2014 ${m.type} (${m.commentary})`, 'dim');
      });
    }
    if (r.emotion) log(`${r.emotion.face} "${r.emotion.message}"`, 'info');
    if (r.game && r.game.pgn) {
      lastSparPgn = r.game.pgn;
      if (window.Chess) {
        const botWon = cls === 'win';
        const resultLabel = `${won} in ${r.game.moveCount} moves`;
        startSparAnim(r.game.pgn, r.game.opponent, resultLabel, botWon);
      }
    }
    // Show splash screen
    if (typeof showSplash === 'function') {
      showSplash({
        type: cls === 'win' ? 'victory' : cls === 'loss' ? 'defeat' : 'draw',
        title: cls === 'win' ? 'VICTORY!' : cls === 'loss' ? 'DEFEAT' : 'DRAW',
        subtitle: `vs ${r.game.opponent}`,
        stats: { elo: r.eloChange, xp: r.xpGained, moves: r.game.moveCount },
        emotion: r.emotion,
      });
    }
    await refreshDashboard();
  } catch(e) {
    log('Spar error: ' + e.message, 'loss');
    enableActions();
  }
}

// ===================================================================
// Quick Spar
// ===================================================================
async function doQuickSpar() {
  if (sparInProgress) return;
  sparInProgress = true;
  disableActions('Quick Spar...');
  try {
    const r = await api('POST', `/bots/${currentBotId}/quick-spar`);
    showQuickSparResult(r);
    await refreshDashboard();
  } catch(e) {
    log('Quick Spar failed: ' + e.message, 'loss');
  } finally {
    sparInProgress = false;
    enableActions();
  }
}

function showQuickSparResult(r) {
  const res = r.game.result;
  const botWon = (res === '1-0' && r.game.botPlayedWhite) || (res === '0-1' && !r.game.botPlayedWhite);
  const botLost = (res === '1-0' && !r.game.botPlayedWhite) || (res === '0-1' && r.game.botPlayedWhite);
  const cls = botWon ? 'win' : botLost ? 'loss' : 'draw';
  const won = botWon ? 'WON' : botLost ? 'LOST' : 'DREW';

  log(`⚔️ Quick Spar: ${won} in ${r.game.moveCount} moves (Elo ${r.eloChange >= 0 ? '+' : ''}${r.eloChange}, +${r.xpGained} XP, +${r.energyEarned} energy)`, cls);

  // Show key moments
  if (r.keyMoments && r.keyMoments.length > 0) {
    r.keyMoments.slice(0, 2).forEach(m => {
      log(`  Move ${m.moveNumber}: ${m.move} — ${m.type}`, 'dim');
    });
  }

  // Show loot
  if (r.loot && r.loot.type !== 'none') {
    switch (r.loot.type) {
      case 'insight': log(`💡 Insight: "${r.loot.data.message}"`, 'info'); break;
      case 'energy': log(`⚡ Bonus energy: +${r.loot.data.amount}`, 'info'); break;
      case 'card': log(`🃏 Card drop: ${r.loot.data.card?.name || 'New card added!'}`, 'info'); break;
      case 'intel': log(`🔍 Boss Intel: ${r.loot.data.scoutText || 'Intel gathered!'}`, 'info'); break;
    }
  }

  // Show streak
  if (r.streak >= 3) {
    log(`🔥 Win streak: ${r.streak}x (+2 bonus energy!)`, 'info');
  } else if (r.streak > 0 && botWon) {
    log(`Streak: ${r.streak}x`, 'dim');
  }

  // Show emotion
  if (r.emotion) log(`${r.emotion.face} "${r.emotion.message}"`, 'info');

  // Store PGN for replay
  if (r.game && r.game.pgn) {
    lastSparPgn = r.game.pgn;
  }

  // Elo milestone detection
  if (previousElo !== null) {
    const oldMilestone = Math.floor(previousElo / 50);
    const newMilestone = Math.floor(r.newElo / 50);
    if (newMilestone > oldMilestone) {
      log(`🏅 Elo milestone: ${newMilestone * 50}!`, 'info');
    }
  }
  previousElo = r.newElo;

  // Show splash
  if (typeof showSplash === 'function') {
    showSplash({
      type: botWon ? 'victory' : botLost ? 'defeat' : 'draw',
      title: botWon ? 'VICTORY!' : botLost ? 'DEFEAT' : 'DRAW',
      subtitle: `Quick Spar vs ${r.game.opponent}`,
      stats: { elo: r.eloChange, xp: r.xpGained, energy: r.energyEarned, moves: r.game.moveCount },
      emotion: r.emotion,
      loot: r.loot,
    });
  }
}

// ===================================================================
// Boss Fight (free ladder fight)
// ===================================================================
async function doBossFight() {
  if (sparInProgress) return;
  sparInProgress = true;
  disableActions('Boss fight...');
  try {
    const r = await api('POST', `/bots/${currentBotId}/boss-fight`);
    const botWon = r.botWon;
    const cls = botWon ? 'win' : 'loss';

    log(`⚔️ Boss Fight: ${botWon ? 'WON' : 'LOST'} in ${r.game.moveCount} moves`, cls);

    if (botWon) {
      log('✅ Ladder opponent defeated!', 'info');
    } else {
      log(`💪 Keep training! +3 bonus energy`, 'info');
      if (r.bossLossAdvice) {
        log(`💡 Tip: Try ${r.bossLossAdvice.suggestedCard} — ${r.bossLossAdvice.suggestedAction}`, 'info');
      }
    }

    if (r.emotion) log(`${r.emotion.face} "${r.emotion.message}"`, 'info');

    // Show splash
    if (typeof showSplash === 'function') {
      showSplash({
        type: botWon ? 'victory' : 'defeat',
        title: botWon ? 'BOSS DEFEATED!' : 'BOSS WINS',
        subtitle: `vs ${r.game.opponent}`,
        stats: { elo: r.eloChange, xp: r.xpGained, moves: r.game.moveCount },
        emotion: r.emotion,
        bossLossAdvice: r.bossLossAdvice,
      });
    }

    await refreshDashboard();
  } catch(e) {
    log('Boss fight failed: ' + e.message, 'loss');
  } finally {
    sparInProgress = false;
    enableActions();
  }
}

// ===================================================================
// Championship Bout
// ===================================================================
async function startChampionship() {
  if (sparInProgress) return;
  sparInProgress = true;
  try {
    const bout = await api('POST', `/bots/${currentBotId}/championship/start`);
    log(`🏆 Championship started! Round 1: ${bout.roundTitle}`, 'info');
    await refreshDashboard();
  } catch(e) {
    log('Championship error: ' + e.message, 'loss');
  } finally {
    sparInProgress = false;
  }
}

async function playChampionshipRound() {
  if (sparInProgress) return;
  sparInProgress = true;
  disableActions('Championship round...');
  try {
    const r = await api('POST', `/bots/${currentBotId}/championship/play-round`);
    const cls = r.roundResult === 'win' ? 'win' : 'loss';
    log(`🏆 ${r.roundTitle}: ${r.roundResult.toUpperCase()} (Score: ${r.bout.gamesWon}-${r.bout.gamesPlayed - r.bout.gamesWon})`, cls);

    if (r.bout.status === 'won') {
      log(`🎉 CHAMPION! Advanced to Level ${r.newLevel}!`, 'win');
      showSplash({
        type: 'levelup',
        title: 'CHAMPION!',
        subtitle: `Advanced to Level ${r.newLevel}!`,
        stats: { elo: r.game?.eloChange, xp: r.game?.xpGained, wins: r.bout.gamesWon, total: r.bout.gamesPlayed },
        emotion: r.emotion,
      });
    } else if (r.bout.status === 'lost') {
      log('😤 Championship lost. +3 bonus energy. Train harder!', 'loss');
      if (r.bossLossAdvice) {
        log(`💡 Tip: ${r.bossLossAdvice.suggestedCard} — ${r.bossLossAdvice.suggestedAction}`, 'info');
      }
      showSplash({
        type: 'defeat',
        title: 'ALMOST!',
        subtitle: `Championship lost ${r.bout.gamesWon}-${r.bout.gamesPlayed - r.bout.gamesWon}. Keep training!`,
        stats: { energy: 3 },
        emotion: r.emotion,
      });
    } else {
      // Still active, show round result
      showSplash({
        type: r.roundResult === 'win' ? 'victory' : 'defeat',
        title: `${r.roundTitle}: ${r.roundResult.toUpperCase()}`,
        subtitle: `Score: ${r.bout.gamesWon}-${r.bout.gamesPlayed - r.bout.gamesWon}`,
        stats: { moves: r.game?.moveCount },
        emotion: r.emotion,
      });
    }

    await refreshDashboard();
  } catch(e) {
    log('Championship error: ' + e.message, 'loss');
  } finally {
    sparInProgress = false;
    enableActions();
  }
}

// ===================================================================
// Tactic shop
// ===================================================================
const CATEGORY_LABELS = {
  tactical: '\u2694\uFE0F Tactical',
  positional: '\u265F Positional',
  aggressive: '\uD83D\uDD25 Aggressive',
  defensive: '\uD83D\uDEE1\uFE0F Defensive',
  endgame: '\uD83D\uDC51 Endgame'
};
const OPENING_KEYS = ['italian_game','sicilian_defense','french_defense','queens_gambit','kings_indian','london_system'];

async function showTacticShop() {
  closeFloatingPanels();
  disableActions('Loading shop...');
  try {
    const tactics = await api('GET', '/catalog/tactics');
    const dash = await api('GET', `/bots/${currentBotId}/dashboard`);
    const owned = new Set((dash.tactics || []).map(t => t.key));
    const botLevel = dash.stats.level;
    const pts = dash.training.pointsRemaining;

    const shopPanel = document.getElementById('tacticShopPanel');
    const shopList = document.getElementById('tacticShopList');

    let html = '';
    for (const t of tactics) {
      const isOwned = owned.has(t.key);
      const isLocked = botLevel < t.minLevel;
      const isOpening = OPENING_KEYS.includes(t.key);
      const catLabel = CATEGORY_LABELS[t.category] || t.category;

      let cardClass = 'tactic-card';
      if (isOwned) cardClass += ' owned';
      if (isLocked) cardClass += ' locked';

      let actionHtml;
      if (isOwned) {
        actionHtml = '<span style="color:var(--neon-green);font-size:0.85rem">Owned \u2713</span>';
      } else if (isLocked) {
        actionHtml = `<span style="color:var(--text-dim);font-size:0.8rem">\uD83D\uDD12 Level ${t.minLevel}</span>`;
      } else if (pts < 3) {
        actionHtml = '<button disabled>Need 3 pts</button>';
      } else {
        actionHtml = `<button onclick="buyTactic('${t.key}', '${escAttr(t.name)}')">Buy</button>`;
      }

      html += `<div class="${cardClass}">
        <div class="tactic-info">
          <div class="tactic-name">${escHtml(t.name)}${isOpening ? ' <span style="color:var(--neon-yellow);font-size:0.75rem">(Opening)</span>' : ''}</div>
          <div class="tactic-desc">${escHtml(t.description)}</div>
          <div class="tactic-meta"><span class="category">${catLabel}</span> \u00B7 Min Level: ${t.minLevel}</div>
        </div>
        <div>${actionHtml}</div>
      </div>`;
    }

    shopList.innerHTML = html;
    shopPanel.classList.remove('hidden');
    shopPanel.scrollIntoView({ behavior: 'smooth' });
    enableActions();
  } catch(e) {
    log('Shop error: ' + e.message, 'loss');
    enableActions();
  }
}

async function buyTactic(key, name) {
  try {
    const r = await api('POST', `/bots/${currentBotId}/train/purchase`, { tactic_key: key });
    log(`Purchased "${name}"! Proficiency: ${r.tactic.proficiency}%`, 'info');
    if (r.emotion) log(`${r.emotion.face} "${r.emotion.message}"`, 'info');
    await refreshDashboard();
    await showTacticShop();
  } catch(e) { log('Purchase error: ' + e.message, 'loss'); }
}

function closeTacticShop() {
  document.getElementById('tacticShopPanel').classList.add('hidden');
}

// ===================================================================
// Drill
// ===================================================================
async function doDrill() {
  closeFloatingPanels();
  disableActions('Drilling...');
  try {
    const dash = await api('GET', `/bots/${currentBotId}/dashboard`);
    if (!dash.tactics || dash.tactics.length === 0) { log('No tactics to drill. Buy one first!', 'dim'); return; }
    const t = dash.tactics[0];
    const r = await api('POST', `/bots/${currentBotId}/train/drill`, { tactic_key: t.tacticKey });
    log(`Drilled ${t.tacticKey}: proficiency now ${r.tactic.proficiency}%`, 'info');
    await refreshDashboard();
  } catch(e) { log('Drill error: ' + e.message, 'loss'); enableActions(); }
}

// ===================================================================
// Level test
// ===================================================================
async function doLevelTest() {
  closeFloatingPanels();
  log('Starting level test... (this runs multiple games, may take a minute)', 'dim');
  disableActions('Running level test...');
  try {
    const r = await api('POST', `/bots/${currentBotId}/level-test`);

    log('\u2500\u2500\u2500 Level Test Results \u2500\u2500\u2500', 'info');
    if (r.games && r.games.length > 0) {
      r.games.forEach((g, i) => {
        const botWon = (g.result === '1-0' && g.botPlayedWhite) || (g.result === '0-1' && !g.botPlayedWhite);
        const botLost = (g.result === '1-0' && !g.botPlayedWhite) || (g.result === '0-1' && g.botPlayedWhite);
        const outcome = botWon ? 'WON' : botLost ? 'LOST' : 'DREW';
        const cls = botWon ? 'win' : botLost ? 'loss' : 'draw';
        const color = g.botPlayedWhite ? 'White' : 'Black';
        log(`  Game ${i+1} vs ${g.opponentName}: ${outcome} in ${g.moveCount} moves (played ${color})`, cls);
      });
    }

    const total = r.wins + r.losses + r.draws;
    if (r.passed) {
      log(`\u2705 PASSED! ${r.wins}/${total} wins (needed ${r.winsRequired}) \u2014 Advanced to Level ${r.newLevel}!`, 'win');
    } else {
      log(`\u274C FAILED: ${r.wins}/${total} wins (needed ${r.winsRequired})`, 'loss');
    }

    const eloSign = r.eloChange >= 0 ? '+' : '';
    log(`  Elo: ${r.newElo - r.eloChange} \u2192 ${r.newElo} (${eloSign}${r.eloChange})  |  XP: +${r.xpGained}${r.bonusPoints > 0 ? `  |  Bonus: +${r.bonusPoints} training pts` : ''}`, 'dim');

    if (r.emotion) log(`${r.emotion.face} "${r.emotion.message}"`, 'info');
    // Show splash screen for level test
    if (typeof showSplash === 'function') {
      if (r.passed) {
        showSplash({
          type: 'levelup',
          title: 'LEVEL UP!',
          subtitle: `Advanced to Level ${r.newLevel}!`,
          stats: { elo: r.eloChange, xp: r.xpGained, wins: r.wins, total: r.wins + r.losses + r.draws },
          emotion: r.emotion,
        });
      } else {
        showSplash({
          type: 'defeat',
          title: 'TEST FAILED',
          subtitle: `${r.wins}/${r.wins + r.losses + r.draws} wins (needed ${r.winsRequired})`,
          stats: { elo: r.eloChange, xp: r.xpGained, bonus: r.bonusPoints },
          emotion: r.emotion,
        });
      }
    }
    await refreshDashboard();
  } catch(e) {
    log('Level test error: ' + e.message, 'loss');
    enableActions();
  }
}

// ===================================================================
// Layout helpers
// ===================================================================
function setBoardActive(active) {
  const container = document.getElementById('mainContainer');
  if (active) container.classList.add('board-active');
  else container.classList.remove('board-active');
}

// ===================================================================
// Utility
// ===================================================================
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ===================================================================
// Init
// ===================================================================
initSliders();
checkHealth();

// Show dev panel if ?dev=1 in URL
const IS_DEV = new URLSearchParams(window.location.search).has('dev');
if (IS_DEV) {
  const devObs = new MutationObserver(() => {
    if (!document.getElementById('dashPanel').classList.contains('hidden')) {
      document.getElementById('devPanel').classList.remove('hidden');
    }
  });
  devObs.observe(document.getElementById('dashPanel'), { attributes: true });
}
