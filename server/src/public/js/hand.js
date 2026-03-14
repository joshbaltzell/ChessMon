/* ============================================================
   ChessMon — Card Hand UI
   Hand management: draw, play, energy, animations
   ============================================================ */

// Current hand state (synced with server)
let currentHand = null;

/**
 * Load and display the card hand for the current bot.
 * Called from refreshDashboard() when hand data is available.
 */
function displayHand(handState) {
  if (!handState) return;
  currentHand = handState;

  const panel = document.getElementById('handPanel');
  panel.classList.remove('hidden');

  updateEnergyDisplay();
  updateRoundInfo();
  renderHandCards();
}

/**
 * Hide the hand panel (e.g., when no bot is selected).
 */
function hideHand() {
  currentHand = null;
  document.getElementById('handPanel').classList.add('hidden');
}

/**
 * Update the energy orb display.
 */
function updateEnergyDisplay() {
  if (!currentHand) return;
  const el = document.getElementById('energyDisplay');
  el.innerHTML = renderEnergyDisplay(currentHand.energy, currentHand.maxEnergy);
}

/**
 * Update round info display.
 */
function updateRoundInfo() {
  if (!currentHand) return;
  const el = document.getElementById('roundInfo');
  el.innerHTML = renderRoundInfo(currentHand.roundNumber, currentHand.cardsPlayed);
}

/**
 * Render all cards in the hand container with fan layout.
 */
function renderHandCards() {
  const container = document.getElementById('handContainer');
  container.innerHTML = '';

  if (!currentHand || currentHand.cards.length === 0) {
    container.innerHTML = `
      <div class="hand-empty">
        <div class="hand-empty-icon">🃏</div>
        <div class="hand-empty-text">No cards in hand</div>
        <button onclick="drawNewHand()">Draw New Hand</button>
      </div>
    `;
    return;
  }

  currentHand.cards.forEach((card, i) => {
    const disabled = card.key !== 'focus' && card.energy > currentHand.energy;
    const el = renderCard(card, {
      disabled,
      onClick: () => playCardFromHand(card),
    });

    // Stagger deal animation
    el.classList.add('card-dealing');
    el.style.animationDelay = `${i * 0.08}s`;

    container.appendChild(el);
  });
}

/**
 * Draw a new hand from the server.
 */
async function drawNewHand() {
  if (!currentBotId) return;

  const btn = document.getElementById('drawHandBtn');
  btn.disabled = true;
  btn.textContent = 'Drawing...';

  try {
    const hand = await api('POST', `/bots/${currentBotId}/hand/new-round`);
    currentHand = hand;
    updateEnergyDisplay();
    updateRoundInfo();
    renderHandCards();
    log(`New cards drawn! Energy preserved: ${hand.energy}`, 'info');
  } catch (e) {
    log('Draw error: ' + e.message, 'loss');
  } finally {
    btn.disabled = false;
    btn.textContent = 'New Round';
  }
}

/**
 * Play a card from the hand.
 * Handles different card types with appropriate UI flows.
 */
async function playCardFromHand(card) {
  if (!currentBotId || !currentHand) return;

  // Check energy (focus is free and gives energy)
  if (card.key !== 'focus' && card.energy > currentHand.energy) {
    log('Not enough energy!', 'loss');
    return;
  }

  // Some cards need additional input
  if (card.key === 'spar' || card.key === 'power_spar') {
    showCardSparPicker(card);
    return;
  }

  if (card.key === 'drill' || card.key === 'deep_drill') {
    await playDrillCard(card);
    return;
  }

  if (card.key === 'study') {
    await playStudyCard(card);
    return;
  }

  if (card.key === 'challenge') {
    await playChallengeCard(card);
    return;
  }

  // Simple cards: focus, rest, analyze, scout — just play directly
  await executeCardPlay(card.id, {});
}

/**
 * Execute a card play on the server and handle the result.
 */
async function executeCardPlay(cardId, extraBody) {
  const playArea = document.getElementById('handPlayArea');
  playArea.classList.add('active');

  // Animate the played card
  const cardEl = document.querySelector(`.card[data-card-id="${cardId}"]`);
  if (cardEl) {
    cardEl.classList.add('card-playing');
  }

  try {
    const body = { card_id: cardId, ...extraBody };
    const result = await api('POST', `/bots/${currentBotId}/hand/play`, body);

    // Update hand state
    currentHand = result.hand;
    updateEnergyDisplay();
    updateRoundInfo();

    // Show effect message
    showPlayEffect(result.card, result.effect);

    // Handle different effects
    await handleCardEffect(result.card, result.effect);

    // Re-render remaining cards (after short delay for animation)
    setTimeout(() => {
      renderHandCards();
      playArea.classList.remove('active');
    }, 800);

    return result;
  } catch (e) {
    log('Card play error: ' + e.message, 'loss');
    playArea.classList.remove('active');
    // Re-render to reset card states
    renderHandCards();
    return null;
  }
}

/**
 * Show a visual effect message when a card is played.
 */
function showPlayEffect(card, effect) {
  const playArea = document.getElementById('handPlayArea');

  let msg = '';
  let color = card.color;

  switch (card.key) {
    case 'focus':
      msg = '✨ +1 Energy!';
      color = '#ffd700';
      break;
    case 'rest':
      msg = '💤 Hand Refreshed!';
      color = '#6a6a8a';
      break;
    case 'analyze':
      msg = '🧠 Opening Bot Brain...';
      color = '#00d4ff';
      break;
    case 'scout':
      msg = '🔍 Scouting...';
      color = '#00d4ff';
      break;
    case 'spar':
    case 'power_spar':
      msg = card.key === 'power_spar' ? '💥 Power Spar!' : '⚔️ Sparring!';
      color = '#ff2d8a';
      break;
    case 'drill':
    case 'deep_drill':
      msg = card.key === 'deep_drill' ? '⛏️ Deep Drilling!' : '🎯 Drilling!';
      color = '#00ff88';
      break;
    case 'study':
      msg = '📖 Opening Shop...';
      color = '#b44aff';
      break;
    case 'challenge':
      msg = '🎮 Challenge Accepted!';
      color = '#ff6b2d';
      break;
    default:
      msg = `Played ${card.name}!`;
  }

  playArea.innerHTML = `<div class="play-effect-msg" style="color:${color}">${msg}</div>`;

  // Auto-clear after delay
  setTimeout(() => {
    playArea.innerHTML = '';
  }, 2000);
}

/**
 * Handle the card's effect after playing.
 */
async function handleCardEffect(card, effect) {
  if (!effect) return;

  switch (effect.action) {
    case 'open_brain':
      showBotBrain();
      break;
    case 'open_shop':
      showTacticShop();
      break;
    case 'open_play':
      startPlay();
      break;
    case 'scout_info':
      if (effect.name) {
        log(`🔍 Scout: ${effect.name} (Lv.${effect.level})`, 'info');
        log(`   Weakness: ${effect.weakness}`, 'dim');
        log(`   ${effect.scoutText}`, 'dim');
        log(`   Play style: ${effect.playStyleHint}`, 'dim');
      } else {
        log(`🔍 ${effect.message || 'No opponent to scout.'}`, 'info');
      }
      break;
    case 'energy_gained':
      log('✨ Focus: +1 Energy!', 'info');
      break;
    case 'hand_refreshed':
      log('💤 Rest: New hand drawn!', 'info');
      break;
    default:
      // For spar/drill effects, log results
      if (effect.game) {
        const res = effect.game.result;
        const won = (res === '1-0' && effect.game.botPlayedWhite) || (res === '0-1' && !effect.game.botPlayedWhite);
        const drew = res === '1/2-1/2';
        const cls = won ? 'win' : drew ? 'draw' : 'loss';
        const label = won ? 'WON' : drew ? 'DREW' : 'LOST';
        log(`${card.icon} ${card.name} vs ${effect.game.opponent}: ${label} in ${effect.game.moveCount} moves (Elo ${effect.eloChange >= 0 ? '+' : ''}${effect.eloChange}, +${effect.xpGained} XP)`, cls);

        if (effect.emotion) {
          log(`${effect.emotion.face} "${effect.emotion.message}"`, 'info');
        }

        // Show spar animation if available
        if (effect.game.pgn && window.Chess) {
          lastSparPgn = effect.game.pgn;
          const botWon = won;
          const resultLabel = `${label} in ${effect.game.moveCount} moves`;
          startSparAnim(effect.game.pgn, effect.game.opponent, resultLabel, botWon);
        }
      }
      if (effect.tactic) {
        log(`${card.icon} ${card.name}: ${effect.tactic.tacticKey} proficiency now ${effect.tactic.proficiency}%`, 'info');
      }
      break;
  }
}

/**
 * Show spar picker for Spar/Power Spar cards.
 */
function showCardSparPicker(card) {
  closeFloatingPanels();
  const panel = document.getElementById('sparPickPanel');
  const list = document.getElementById('sparOpponentList');

  // Get bot level from dashboard or current state
  const botLevel = window._lastDashboard?.stats?.level || 1;
  const botElo = window._lastDashboard?.stats?.elo || 400;

  const minLv = Math.max(1, botLevel - 1);
  const maxLv = Math.min(20, botLevel + 3);
  const opponents = SYSTEM_BOTS.filter(b => b.level >= minLv && b.level <= maxLv);

  const sparLabel = card.key === 'power_spar' ? 'Power Spar' : 'Spar';

  list.innerHTML = opponents.map(o => {
    const diff = o.elo - botElo;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    const diffCls = diff > 100 ? 'color:var(--neon-pink)' : diff > 0 ? 'color:var(--neon-yellow)' : 'color:var(--neon-green)';
    const recommended = o.level === botLevel || o.level === botLevel + 1;
    return `<div class="tactic-card" style="cursor:pointer" onclick="doCardSpar('${card.id}', ${o.level})">
      <div class="tactic-info">
        <div class="tactic-name">Lv.${o.level} ${escHtml(o.name)}${recommended ? ' \u2B50' : ''}</div>
        <div class="tactic-desc">${escHtml(o.description || '')}</div>
        <div class="tactic-meta">${sparLabel} \u2014 Elo ${o.elo} <span style="${diffCls}">(${diffStr} vs your bot)</span></div>
      </div>
    </div>`;
  }).join('');

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Execute a spar card against a chosen opponent.
 */
async function doCardSpar(cardId, opponentLevel) {
  document.getElementById('sparPickPanel').classList.add('hidden');
  log(`Starting card spar vs Lv.${opponentLevel}...`, 'dim');

  const result = await executeCardPlay(cardId, { opponent_level: opponentLevel });
  if (result) {
    // Refresh dashboard to show updated stats
    await refreshDashboard();
  }
}

/**
 * Play a Drill or Deep Drill card — auto-picks first tactic.
 */
async function playDrillCard(card) {
  const dash = window._lastDashboard;
  if (!dash || !dash.tactics || dash.tactics.length === 0) {
    log('No tactics to drill. Buy one first!', 'dim');
    return;
  }

  // Use first available tactic
  const tacticKey = dash.tactics[0].key || dash.tactics[0].tacticKey;
  const result = await executeCardPlay(card.id, { tactic_key: tacticKey });
  if (result) {
    await refreshDashboard();
  }
}

/**
 * Play a Study card — opens the tactic shop, then plays the card.
 */
async function playStudyCard(card) {
  // Play the card first (deduct energy, remove from hand)
  const result = await executeCardPlay(card.id, {});
  // The effect handler will open the shop
}

/**
 * Play a Challenge card — opens play vs bot.
 */
async function playChallengeCard(card) {
  const result = await executeCardPlay(card.id, {});
  // The effect handler will open play mode
}
