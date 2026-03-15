/* ============================================================
   ChessMon — Victory/Defeat Splash Screens
   Full-screen overlay after spar/level test
   ============================================================ */

let splashTimeout = null;

/**
 * Show a splash screen overlay.
 * @param {Object} opts
 * @param {string} opts.type - 'victory' | 'defeat' | 'draw' | 'levelup'
 * @param {string} opts.title - Main title text
 * @param {string} opts.subtitle - Subtitle text
 * @param {Object} opts.stats - {elo, xp, moves, wins, total, bonus}
 * @param {Object} opts.emotion - {face, message}
 */
function showSplash(opts) {
  // Remove any existing splash
  dismissSplash();

  const overlay = document.createElement('div');
  overlay.className = `splash-overlay splash-${opts.type}`;
  overlay.id = 'splashOverlay';

  // Build stats HTML
  let statsHtml = '';
  if (opts.stats) {
    const items = [];
    if (opts.stats.elo !== undefined) {
      const eloVal = opts.stats.elo >= 0 ? `+${opts.stats.elo}` : `${opts.stats.elo}`;
      const eloCls = opts.stats.elo >= 0 ? 'positive' : 'negative';
      items.push(`<div class="splash-stat"><div class="splash-stat-value ${eloCls}">${eloVal}</div><div class="splash-stat-label">Elo</div></div>`);
    }
    if (opts.stats.xp !== undefined) {
      items.push(`<div class="splash-stat"><div class="splash-stat-value positive">+${opts.stats.xp}</div><div class="splash-stat-label">XP</div></div>`);
    }
    if (opts.stats.moves !== undefined) {
      items.push(`<div class="splash-stat"><div class="splash-stat-value">${opts.stats.moves}</div><div class="splash-stat-label">Moves</div></div>`);
    }
    if (opts.stats.wins !== undefined && opts.stats.total !== undefined) {
      items.push(`<div class="splash-stat"><div class="splash-stat-value gold">${opts.stats.wins}/${opts.stats.total}</div><div class="splash-stat-label">Wins</div></div>`);
    }
    if (opts.stats.bonus > 0) {
      items.push(`<div class="splash-stat"><div class="splash-stat-value gold">+${opts.stats.bonus}</div><div class="splash-stat-label">Bonus Pts</div></div>`);
    }
    if (opts.stats.energy !== undefined) {
      items.push(`<div class="splash-stat"><div class="splash-stat-value positive">+${opts.stats.energy}</div><div class="splash-stat-label">Energy</div></div>`);
    }
    statsHtml = `<div class="splash-stats">${items.join('')}</div>`;
  }

  // Loot display
  let lootHtml = '';
  if (opts.loot && opts.loot.type !== 'none') {
    const lootIcons = { insight: '💡', energy: '⚡', card: '🃏', intel: '🔍' };
    const lootIcon = lootIcons[opts.loot.type] || '🎁';
    let lootText = '';
    switch (opts.loot.type) {
      case 'insight': lootText = opts.loot.data.message; break;
      case 'energy': lootText = `+${opts.loot.data.amount} Energy`; break;
      case 'card': lootText = opts.loot.data.card?.name || 'New card!'; break;
      case 'intel': lootText = opts.loot.data.scoutText || 'Boss intel!'; break;
    }
    lootHtml = `<div class="splash-loot">${lootIcon} ${escHtml(lootText)}</div>`;
  }

  // Emotion
  let emotionHtml = '';
  if (opts.emotion) {
    emotionHtml = `<div class="splash-emotion"><span class="splash-face">${escHtml(opts.emotion.face)}</span>${escHtml(opts.emotion.message)}</div>`;
  }

  overlay.innerHTML = `
    <div class="splash-title">${escHtml(opts.title)}</div>
    <div class="splash-subtitle">${escHtml(opts.subtitle)}</div>
    ${statsHtml}
    ${lootHtml}
    ${emotionHtml}
    <div class="splash-dismiss">Click anywhere to continue</div>
  `;

  document.body.appendChild(overlay);

  // Spawn particles
  spawnParticles(overlay, opts.type);

  // Click to dismiss
  overlay.addEventListener('click', dismissSplash);

  // Auto-dismiss after 6 seconds
  splashTimeout = setTimeout(dismissSplash, 6000);
}

/**
 * Dismiss the splash screen.
 */
function dismissSplash() {
  if (splashTimeout) {
    clearTimeout(splashTimeout);
    splashTimeout = null;
  }
  const overlay = document.getElementById('splashOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Spawn particles appropriate for the splash type.
 */
function spawnParticles(container, type) {
  const colors = {
    victory: ['var(--neon-green)', 'var(--neon-blue)', 'var(--neon-yellow)', 'var(--neon-purple)'],
    defeat: ['var(--neon-orange)', 'var(--neon-pink)'],
    draw: ['var(--text-dim)'],
    levelup: ['var(--neon-yellow)', 'var(--neon-orange)', 'var(--neon-green)'],
  };

  const particleColors = colors[type] || colors.victory;
  const count = type === 'victory' || type === 'levelup' ? 30 : type === 'defeat' ? 15 : 8;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];

      if (type === 'victory' || type === 'levelup') {
        // Confetti falls down
        p.className = 'splash-confetti';
        p.style.cssText = `
          left: ${Math.random() * 100}%;
          top: -20px;
          background: ${color};
          width: ${4 + Math.random() * 8}px;
          height: ${4 + Math.random() * 8}px;
          border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
          animation-duration: ${2 + Math.random() * 3}s;
          animation-delay: ${Math.random() * 0.5}s;
        `;
      } else if (type === 'defeat') {
        // Embers float up
        p.className = 'splash-ember';
        const drift = -50 + Math.random() * 100;
        p.style.cssText = `
          left: ${30 + Math.random() * 40}%;
          bottom: 10%;
          background: ${color};
          --drift: ${drift}px;
          animation-duration: ${2 + Math.random() * 2}s;
          animation-delay: ${Math.random() * 1}s;
        `;
      } else {
        // Small floating particles
        p.className = 'splash-particle';
        p.style.cssText = `
          left: ${Math.random() * 100}%;
          top: ${Math.random() * 100}%;
          width: ${2 + Math.random() * 4}px;
          height: ${2 + Math.random() * 4}px;
          background: ${color};
          animation-duration: ${3 + Math.random() * 2}s;
        `;
      }

      container.appendChild(p);
    }, i * 80);
  }
}
