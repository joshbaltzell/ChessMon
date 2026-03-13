/* ============================================================
   ChessMon — Card Definitions & Rendering
   Creates card DOM elements from card data
   ============================================================ */

/**
 * Render a single card element from card data.
 * @param {Object} card - HandCard object {id, key, name, energy, type, color, icon, description, flavor}
 * @param {Object} opts - Options: {disabled, onClick}
 * @returns {HTMLElement} The card DOM element
 */
function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (opts.disabled ? ' disabled' : '');
  el.style.setProperty('--card-color', card.color);
  el.dataset.cardId = card.id;
  el.dataset.cardKey = card.key;

  const energyClass = card.energy === 0 ? ' free' : '';

  el.innerHTML = `
    <div class="card-header">
      <span class="card-icon">${card.icon}</span>
      <span class="card-energy${energyClass}">${card.energy}</span>
    </div>
    <div class="card-body">
      <div class="card-name">${escHtml(card.name)}</div>
      <div class="card-desc">${escHtml(card.description)}</div>
    </div>
    <div class="card-footer">
      <div class="card-flavor">${escHtml(card.flavor)}</div>
    </div>
  `;

  if (opts.onClick && !opts.disabled) {
    el.addEventListener('click', () => opts.onClick(card));
  }

  return el;
}

/**
 * Render the energy display with orbs.
 * @param {number} current - Current energy
 * @param {number} max - Maximum energy
 * @returns {string} HTML string for energy display
 */
function renderEnergyDisplay(current, max) {
  let orbsHtml = '';
  for (let i = 0; i < max; i++) {
    if (i < current) {
      orbsHtml += '<div class="energy-orb filled"></div>';
    } else {
      orbsHtml += '<div class="energy-orb spent"></div>';
    }
  }

  // If max is large, show compact version
  if (max > 12) {
    return `
      <span class="energy-label">Energy</span>
      <span class="energy-count">${current}/${max}</span>
    `;
  }

  return `
    <span class="energy-label">Energy</span>
    <div class="energy-orbs">${orbsHtml}</div>
    <span class="energy-count">${current}/${max}</span>
  `;
}

/**
 * Render round info.
 * @param {number} roundNumber - Current round
 * @param {number} cardsPlayed - Cards played this round
 * @returns {string} HTML string for round info
 */
function renderRoundInfo(roundNumber, cardsPlayed) {
  return `
    <span class="round-number">Round ${roundNumber}</span>
    <span class="cards-played">${cardsPlayed} cards played</span>
  `;
}
