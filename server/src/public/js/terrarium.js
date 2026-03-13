/* ============================================================
   ChessMon — Bot Terrarium
   Renders the bot enclosure with aura, breathing, mood, attrs
   ============================================================ */

/**
 * Render the terrarium from dashboard data.
 * Replaces the static ASCII display with an animated enclosure.
 * @param {Object} d - Dashboard data
 * @param {HTMLElement} container - The dashContent element
 */
function renderTerrarium(d) {
  const c = document.getElementById('dashContent');

  const asciiHtml = (d.appearance.asciiArt || []).map(l => escHtml(l)).join('\n');
  const xpPct = d.stats.xpForNextLevel > 0 ? Math.round((d.stats.xp / d.stats.xpForNextLevel) * 100) : 100;

  // Determine aura level based on bot level
  let auraClass = '';
  if (d.stats.level >= 16) auraClass = 'aura-radiating';
  else if (d.stats.level >= 11) auraClass = 'aura-pulsing';
  else if (d.stats.level >= 6) auraClass = 'aura-glow';
  else if (d.stats.level >= 3) auraClass = 'aura-faint';

  // Aura color based on alignment
  let auraColor = 'var(--neon-blue)';
  if (d.identity.alignmentAttack === 'aggressive') auraColor = 'var(--neon-pink)';
  else if (d.identity.alignmentAttack === 'defensive') auraColor = 'var(--neon-green)';

  // Attribute bars
  const attrs = [
    { key: 'aggression', label: 'AGG', value: d.attributes.aggression },
    { key: 'positional', label: 'POS', value: d.attributes.positional },
    { key: 'tactical',   label: 'TAC', value: d.attributes.tactical },
    { key: 'endgame',    label: 'END', value: d.attributes.endgame },
    { key: 'creativity', label: 'CRE', value: d.attributes.creativity },
  ];
  const attrBars = attrs.map(a =>
    `<span class="attr-label">${a.label}</span>` +
    `<div class="attr-bar"><div class="attr-bar-fill attr-${a.key}" style="width:${(a.value / 20) * 100}%"></div></div>` +
    `<span class="attr-value">${a.value}</span>`
  ).join('');

  // Mood section
  let moodHtml = '';
  if (d.mood) {
    moodHtml = `
      <div class="terrarium-mood">
        <div class="mood-face">${escHtml(d.mood.face)}</div>
        <div class="mood-bubble${d.mood.sparkle ? ' sparkle' : ''}">${escHtml(d.mood.message)}</div>
      </div>
    `;
  }

  // Pixel art container (for Phase 6) or ASCII
  let artHtml;
  if (d.stats.level >= 6 && typeof renderPixelArt === 'function') {
    artHtml = `<div class="terrarium-art" id="terrariumArt"><canvas id="pixelArtCanvas" width="128" height="128"></canvas></div>`;
  } else {
    artHtml = `<div class="terrarium-art" id="terrariumArt"><pre>${asciiHtml}</pre></div>`;
  }

  c.innerHTML = `
    <div class="terrarium" style="--aura-color:${auraColor}">
      <div class="terrarium-aura ${auraClass}"></div>
      <div class="terrarium-floor"></div>
      ${artHtml}
      <div class="terrarium-name">${escHtml(d.identity.name)}</div>
      <div class="terrarium-level">
        <span class="level-badge">Lv.${d.stats.level}</span>
        <span class="level-elo">${d.stats.elo} elo</span>
      </div>
      <div class="terrarium-xp">
        <div class="terrarium-xp-bar"><div class="terrarium-xp-fill" style="width:${xpPct}%"></div></div>
        <div class="terrarium-xp-text">${d.stats.xp} / ${d.stats.xpForNextLevel} XP</div>
      </div>
      ${moodHtml}
      <div class="terrarium-attrs">${attrBars}</div>
      <div class="terrarium-record">
        <span class="win-count">${d.stats.record.wins}W</span> /
        <span class="loss-count">${d.stats.record.losses}L</span> /
        <span class="draw-count">${d.stats.record.draws}D</span>
        <span style="margin-left:6px">${d.identity.alignmentAttack} / ${d.identity.alignmentStyle}</span>
      </div>
    </div>
    ${d.tactics && d.tactics.length > 0 ? `<div class="tactics-list" style="font-size:0.75rem;color:var(--text-dim);margin-top:6px">Tactics: ${d.tactics.map(t => `<span style="color:var(--neon-green)">${escHtml(t.key || t.tacticKey)}</span> (${t.proficiency}%)`).join(', ')}</div>` : ''}
  `;

  // Trigger pixel art rendering if available
  if (d.stats.level >= 6 && typeof renderPixelArt === 'function') {
    const canvas = document.getElementById('pixelArtCanvas');
    if (canvas) {
      renderPixelArt(canvas, d.identity.id, d.stats.level, d.attributes, d.identity.alignmentAttack, d.identity.alignmentStyle);
    }
  }

  // Start blink animation
  startBlinkTimer();
}

// Blink timer
let blinkTimer = null;
function startBlinkTimer() {
  if (blinkTimer) clearTimeout(blinkTimer);
  scheduleBlink();
}

function scheduleBlink() {
  const delay = 4000 + Math.random() * 5000; // 4-9 seconds
  blinkTimer = setTimeout(() => {
    const art = document.getElementById('terrariumArt');
    if (art) {
      art.classList.add('blink');
      setTimeout(() => {
        art.classList.remove('blink');
        scheduleBlink();
      }, 150);
    }
  }, delay);
}
