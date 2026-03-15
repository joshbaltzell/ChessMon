/* ============================================================
   ChessMon — Card Hand UI
   Hand management: draw, play, energy, animations
   Supports v2 card categories: preparation, powerup, utility
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
  renderLoadout();
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
 * Cards are sorted by category: preparation, powerup, utility.
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

  // Sort by category order: preparation first, then powerup, then utility
  const categoryOrder = { preparation: 0, powerup: 1, utility: 2 };
  const sorted = [...currentHand.cards].sort((a, b) =>
    (categoryOrder[a.category] ?? 3) - (categoryOrder[b.category] ?? 3)
  );

  sorted.forEach((card, i) => {
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
 * Render the active loadout: queued buffs and powerups.
 */
function renderLoadout() {
  const loadoutEl = document.getElementById('loadoutDisplay');
  if (!loadoutEl || !currentHand) return;

  const buffs = currentHand.activeBuffs || [];
  const powerups = currentHand.activePowerups || [];

  if (buffs.length === 0 && powerups.length === 0) {
    loadoutEl.innerHTML = '<div class="loadout-empty">No buffs or powerups queued. Play preparation and powerup cards to power up your next fight!</div>';
    return;
  }

  let html = '';

  if (buffs.length > 0) {
    html += '<div class="loadout-section"><div class="loadout-label">Buffs (next fight)</div>';
    html += buffs.map(b => `<span class="loadout-tag buff-tag">${b.icon} ${escHtml(b.name)}</span>`).join('');
    html += '</div>';
  }

  if (powerups.length > 0) {
    html += '<div class="loadout-section"><div class="loadout-label">Powerups (during fight)</div>';
    html += powerups.map(p => `<span class="loadout-tag powerup-tag">${p.icon} ${escHtml(p.name)}</span>`).join('');
    html += '</div>';
  }

  loadoutEl.innerHTML = html;
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
    renderLoadout();
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
 * Handles different card categories with appropriate UI flows.
 */
async function playCardFromHand(card) {
  if (!currentBotId || !currentHand) return;

  // Check energy (focus is free and gives energy)
  if (card.key !== 'focus' && card.energy > currentHand.energy) {
    log('Not enough energy!', 'loss');
    return;
  }

  // All card categories: play directly, server handles the logic
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

    // Re-render remaining cards and loadout (after short delay for animation)
    setTimeout(() => {
      renderHandCards();
      renderLoadout();
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

  if (effect) {
    switch (effect.action) {
      case 'buff_queued':
        msg = `${card.icon} ${card.name} queued for next fight!`;
        color = '#00ff88';
        break;
      case 'powerup_queued':
        msg = `${card.icon} ${card.name} armed for next fight!`;
        color = '#ff2d8a';
        break;
      case 'energy_gained':
        msg = '✨ +1 Energy!';
        color = '#ffd700';
        break;
      case 'hand_refreshed':
        msg = '💤 Hand Refreshed!';
        color = '#6a6a8a';
        break;
      case 'scout_info':
        msg = '🔍 Scouting...';
        color = '#00d4ff';
        break;
      case 'haste_applied':
        msg = '⚡ Spar cooldown reduced!';
        color = '#ffd700';
        break;
      default:
        msg = `${card.icon} Played ${card.name}!`;
    }
  } else {
    msg = `${card.icon} Played ${card.name}!`;
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
    case 'buff_queued':
      log(`${card.icon} ${card.name} queued — will boost your next fight!`, 'info');
      break;
    case 'powerup_queued':
      log(`${card.icon} ${card.name} armed — will trigger during your next fight!`, 'info');
      break;
    case 'energy_gained':
      log('✨ Focus: +1 Energy!', 'info');
      break;
    case 'hand_refreshed':
      log('💤 Rest: New hand drawn!', 'info');
      break;
    case 'scout_info':
      if (effect.name) {
        log(`🔍 Scout: ${effect.name} (Lv.${effect.level})`, 'info');
        if (effect.specialAbility) {
          log(`   ⚡ Ability: ${effect.specialAbility.name} — ${effect.specialAbility.description}`, 'info');
        }
        log(`   Weakness: ${effect.weakness}`, 'dim');
        log(`   ${effect.scoutText}`, 'dim');
        log(`   Play style: ${effect.playStyleHint}`, 'dim');
        if (effect.counterPrep) {
          log(`   💡 Counter: ${effect.counterPrep}`, 'info');
        }
      } else {
        log(`🔍 ${effect.message || 'No opponent to scout.'}`, 'info');
      }
      break;
    case 'haste_applied':
      log(`⚡ Haste: Next spar cooldown reduced by ${effect.reduction || 60}s!`, 'info');
      break;
    default:
      break;
  }
}
