/* ============================================================
   ChessMon — Programmatic Pixel Art Generator
   Seeded RNG creates deterministic bot creatures that evolve
   ============================================================ */

/**
 * Render pixel art onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} botId
 * @param {number} level
 * @param {Object} attrs - {aggression, positional, tactical, endgame, creativity}
 * @param {string} alignAttack - 'aggressive' | 'balanced' | 'defensive'
 * @param {string} alignStyle - 'chaotic' | 'positional' | 'sacrificial'
 */
function renderPixelArt(canvas, botId, level, attrs, alignAttack, alignStyle) {
  const tier = getPixelTier(level);
  const res = tier === 2 ? 16 : tier === 3 ? 32 : 64;

  canvas.width = res;
  canvas.height = res;
  canvas.style.width = '128px';
  canvas.style.height = '128px';
  canvas.style.imageRendering = 'pixelated';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rng = seededRng(botId * 1000 + level);
  const palette = getPalette(alignAttack, alignStyle, rng);
  const dominant = getDominant(attrs);

  ctx.clearRect(0, 0, res, res);

  if (tier === 2) {
    drawTier2(ctx, res, rng, palette, dominant);
  } else if (tier === 3) {
    drawTier3(ctx, res, rng, palette, dominant, attrs);
  } else {
    drawTier4(ctx, res, rng, palette, dominant, attrs);
  }
}

function getPixelTier(level) {
  if (level <= 5) return 1; // ASCII (handled by terrarium.js)
  if (level <= 10) return 2; // 16x16
  if (level <= 15) return 3; // 32x32
  return 4; // 64x64
}

// Seeded PRNG (mulberry32)
function seededRng(seed) {
  let t = seed + 0x6D2B79F5;
  return function() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Get palette based on alignment
function getPalette(attack, style, rng) {
  const palettes = {
    aggressive: ['#ff2d8a', '#ff6b2d', '#ffd700', '#1a1a26'],
    balanced: ['#00d4ff', '#b44aff', '#00ff88', '#1a1a26'],
    defensive: ['#00ff88', '#00d4ff', '#6a6a8a', '#1a1a26'],
  };
  const base = palettes[attack] || palettes.balanced;

  // Style modifier
  if (style === 'chaotic') {
    // Add vibrant color
    base[2] = `hsl(${Math.floor(rng() * 360)}, 80%, 60%)`;
  } else if (style === 'sacrificial') {
    // Add fiery accent
    base[1] = '#ff4444';
  }

  return {
    primary: base[0],
    secondary: base[1],
    accent: base[2],
    bg: base[3],
    outline: '#0a0a0f',
    eye: '#ffffff',
  };
}

function getDominant(attrs) {
  const entries = Object.entries(attrs).filter(([k]) =>
    ['aggression', 'positional', 'tactical', 'endgame', 'creativity'].includes(k)
  );
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || 'balanced';
}

// ===== Tier 2: 16x16 Simple Creature =====
function drawTier2(ctx, res, rng, palette, dominant) {
  const halfW = Math.floor(res / 2);

  // Generate left half, mirror to right (symmetric)
  for (let y = 2; y < res - 2; y++) {
    for (let x = 1; x < halfW; x++) {
      const density = getBodyDensity(x, y, res, dominant, rng);
      if (density > 0.45) {
        const color = density > 0.75 ? palette.primary :
                      density > 0.6 ? palette.secondary : palette.accent;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(res - 1 - x, y, 1, 1); // mirror
      }
    }
  }

  // Eyes
  const eyeY = Math.floor(res * 0.35);
  const eyeX1 = Math.floor(res * 0.3);
  const eyeX2 = res - 1 - eyeX1;
  ctx.fillStyle = palette.eye;
  ctx.fillRect(eyeX1, eyeY, 1, 1);
  ctx.fillRect(eyeX2, eyeY, 1, 1);
}

// ===== Tier 3: 32x32 Detailed Creature =====
function drawTier3(ctx, res, rng, palette, dominant, attrs) {
  const halfW = Math.floor(res / 2);

  // Body with more detail
  for (let y = 3; y < res - 3; y++) {
    for (let x = 2; x < halfW; x++) {
      const density = getBodyDensity(x, y, res, dominant, rng);
      if (density > 0.4) {
        let color;
        if (density > 0.8) color = palette.primary;
        else if (density > 0.65) color = palette.secondary;
        else if (density > 0.5) color = palette.accent;
        else color = palette.bg;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(res - 1 - x, y, 1, 1);
      }
    }
  }

  // Outline
  addOutline(ctx, res, palette.outline);

  // Eyes
  const eyeY = Math.floor(res * 0.32);
  const eyeX1 = Math.floor(res * 0.32);
  const eyeX2 = res - 1 - eyeX1;
  ctx.fillStyle = palette.eye;
  ctx.fillRect(eyeX1, eyeY, 2, 2);
  ctx.fillRect(eyeX2 - 1, eyeY, 2, 2);
  ctx.fillStyle = palette.outline;
  ctx.fillRect(eyeX1, eyeY, 1, 1);
  ctx.fillRect(eyeX2, eyeY, 1, 1);

  // Feature based on dominant attribute
  drawFeature(ctx, res, dominant, palette, rng);
}

// ===== Tier 4: 64x64 Full Detail =====
function drawTier4(ctx, res, rng, palette, dominant, attrs) {
  const halfW = Math.floor(res / 2);

  // Body with full detail
  for (let y = 5; y < res - 5; y++) {
    for (let x = 4; x < halfW + 2; x++) {
      const density = getBodyDensity(x, y, res, dominant, rng);
      if (density > 0.35) {
        let color;
        if (density > 0.85) color = palette.primary;
        else if (density > 0.7) color = palette.secondary;
        else if (density > 0.55) color = palette.accent;
        else if (density > 0.45) color = palette.bg;
        else continue;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
        // Slight asymmetry for tier 4
        const mirrorX = res - 1 - x + Math.floor(rng() * 2 - 0.5);
        if (mirrorX >= halfW - 2 && mirrorX < res) {
          ctx.fillRect(mirrorX, y, 1, 1);
        }
      }
    }
  }

  // Outline
  addOutline(ctx, res, palette.outline);

  // Detailed eyes
  const eyeY = Math.floor(res * 0.3);
  const eyeX1 = Math.floor(res * 0.3);
  const eyeX2 = res - eyeX1 - 4;

  // Eye white
  ctx.fillStyle = palette.eye;
  ctx.fillRect(eyeX1, eyeY, 4, 3);
  ctx.fillRect(eyeX2, eyeY, 4, 3);
  // Pupil
  ctx.fillStyle = palette.outline;
  ctx.fillRect(eyeX1 + 1, eyeY, 2, 2);
  ctx.fillRect(eyeX2 + 1, eyeY, 2, 2);
  // Highlight
  ctx.fillStyle = palette.eye;
  ctx.fillRect(eyeX1 + 2, eyeY, 1, 1);
  ctx.fillRect(eyeX2 + 2, eyeY, 1, 1);

  // Features
  drawFeature(ctx, res, dominant, palette, rng);
}

// Generate body density at a point (silhouette shape)
function getBodyDensity(x, y, res, dominant, rng) {
  const cx = res / 2, cy = res / 2;
  const nx = (x - cx) / (res / 2);
  const ny = (y - cy) / (res / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Base shape based on dominant attribute
  let shape;
  switch (dominant) {
    case 'aggression':
      // Spiky (angular)
      shape = 1 - dist * 0.9 + Math.abs(Math.sin(Math.atan2(ny, nx) * 5)) * 0.2;
      break;
    case 'positional':
      // Solid (rounded square)
      shape = 1 - Math.max(Math.abs(nx), Math.abs(ny)) * 0.85;
      break;
    case 'tactical':
      // Angular (diamond-ish)
      shape = 1 - (Math.abs(nx) + Math.abs(ny)) * 0.7;
      break;
    case 'endgame':
      // Regal (tall and narrow)
      shape = 1 - dist * 0.7 - Math.abs(nx) * 0.3;
      break;
    case 'creativity':
      // Flowing (organic blob)
      shape = 1 - dist * 0.8 + Math.sin(nx * 4 + ny * 3) * 0.15;
      break;
    default:
      shape = 1 - dist;
  }

  // Add noise for texture
  shape += (rng() - 0.5) * 0.15;

  return shape;
}

// Add outline to non-transparent pixels
function addOutline(ctx, res, color) {
  const imageData = ctx.getImageData(0, 0, res, res);
  const data = imageData.data;
  const outline = [];

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const idx = (y * res + x) * 4;
      if (data[idx + 3] === 0) {
        // Empty pixel — check if adjacent to a filled pixel
        const neighbors = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < res && ny >= 0 && ny < res) {
            const nIdx = (ny * res + nx) * 4;
            if (data[nIdx + 3] > 0) {
              outline.push([x, y]);
              break;
            }
          }
        }
      }
    }
  }

  ctx.fillStyle = color;
  for (const [x, y] of outline) {
    ctx.fillRect(x, y, 1, 1);
  }
}

// Draw dominant-attribute feature
function drawFeature(ctx, res, dominant, palette, rng) {
  const scale = res / 32; // Normalize to 32x32 base

  switch (dominant) {
    case 'aggression':
      // Horns/spikes on top
      ctx.fillStyle = palette.primary;
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(res * 0.3 + i * res * 0.2);
        const h = Math.floor(3 * scale + rng() * 2 * scale);
        for (let j = 0; j < h; j++) {
          ctx.fillRect(x, Math.floor(res * 0.15) - j, Math.ceil(scale), 1);
        }
      }
      break;

    case 'endgame':
      // Crown
      ctx.fillStyle = palette.accent;
      const crownY = Math.floor(res * 0.12);
      const crownW = Math.floor(res * 0.4);
      const crownX = Math.floor((res - crownW) / 2);
      for (let x = crownX; x < crownX + crownW; x++) {
        const h = (x - crownX) % Math.floor(4 * scale) < Math.floor(2 * scale) ? Math.ceil(3 * scale) : Math.ceil(scale);
        for (let j = 0; j < h; j++) {
          ctx.fillRect(x, crownY - j, 1, 1);
        }
      }
      break;

    case 'creativity':
      // Sparkles/aura dots
      ctx.fillStyle = palette.accent;
      for (let i = 0; i < 5; i++) {
        const ax = Math.floor(rng() * res);
        const ay = Math.floor(rng() * res * 0.5);
        ctx.fillRect(ax, ay, Math.ceil(scale), Math.ceil(scale));
      }
      break;

    default:
      break;
  }
}
