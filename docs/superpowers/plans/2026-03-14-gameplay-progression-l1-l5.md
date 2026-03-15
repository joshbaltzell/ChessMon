# Gameplay Progression L1-L5 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two-speed training loop (free Quick Spars + energy-gated Cards), loot system, win streaks, and championship bouts that take a player from Level 1 to Level 5 in ~35 minutes.

**Architecture:** Quick Spar is a new free endpoint that grants XP + energy + loot. Cards remain the strategy layer, now level-gated. Championship bouts replace level tests with a dramatized best-of-3. All state persists in SQLite via existing Drizzle schema patterns.

**Tech Stack:** Fastify v5, SQLite/Drizzle, Stockfish WASM pool, TensorFlow.js, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-gameplay-progression-l1-l5-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/src/services/loot.service.ts` | Loot roll logic (50/20/15/10/5 probabilities) |
| `server/src/services/championship.service.ts` | Best-of-3 championship bout orchestration |
| `server/src/api/routes/quick-spar.routes.ts` | `POST /bots/:id/quick-spar` endpoint |
| `server/src/api/routes/championship.routes.ts` | `POST /bots/:id/championship/start` and `/play-round` |
| `server/src/data/insights.json` | Curated insight messages per level (for loot drops) |
| `server/__tests__/unit/xp-table.test.ts` | XP table + helper tests |
| `server/__tests__/unit/loot-service.test.ts` | Loot probability + drop logic tests |
| `server/__tests__/unit/card-level-filter.test.ts` | Card level-gating + energy tests |
| `server/__tests__/unit/quick-spar.test.ts` | Quick spar flow + streak tests |
| `server/__tests__/unit/championship.test.ts` | Championship bout lifecycle tests |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/models/progression.ts` | Add `QUICK_SPAR_XP` table, `getXpForSpar()` helper |
| `server/src/db/schema.ts` | Add `winStreak` to `cardHands`, add `championshipBouts` table |
| `server/src/db/connection.ts` | Add `win_streak` column migration + `championship_bouts` CREATE TABLE |
| `server/src/data/cards.json` | Add `unlockedAtLevel` field to all 10 cards |
| `server/src/data/system-bots.json` | Add `weakness`, `scoutText`, `playStyleHint` to L1-L5 bots |
| `server/src/types/index.ts` | Add `ChampionshipBout`, `LootResult` types; add `unlockedAtLevel` to `CardDefinition` |
| `server/src/services/card.service.ts` | Level-filtered `randomDraw()`, `addEnergy()`, `addCardToHand()`, energy starts at 0 |
| `server/src/services/training.service.ts` | Add `quickSpar()` method |
| `server/src/services/ladder.service.ts` | Add `getScoutInfo()` method |
| `server/src/services/dashboard.service.ts` | Add `streak`, `championship`, `contextCues` to response |
| `server/src/ml/training-pipeline.ts` | Add optional `epochs` param to `trainBotFromGame()` |
| `server/src/api/index.ts` | Register quick-spar and championship routes |
| `server/src/api/plugins/rate-limiter.ts` | Add `quickSparLimiter` (1 req/sec per bot) |
| `server/src/api/schemas/validation.ts` | Add championship schemas |
| `server/src/api/routes/card.routes.ts` | Add `/hand/new-round` + `/boss-fight` endpoints, fix power spar 4x multiplier, update scout gimmick data |
| `server/src/public/js/app.js` | Add `doQuickSpar()`, streak display, elo milestones, context cues |
| `server/src/public/js/hand.js` | Energy-from-0, card unlock badges, New Round button |
| `server/src/public/js/ladder.js` | Championship bout UI, boss loss feedback |
| `server/src/public/js/splash.js` | Championship round splashes, loot display |
| `server/src/public/index.html` | Quick Spar button, streak counter, championship containers |

---

## Chunk 1: Foundation — XP Table, Schema, Data, Types

### Task 1: XP Table and Progression Helper

**Files:**
- Modify: `server/src/models/progression.ts`
- Test: `server/__tests__/unit/xp-table.test.ts`

- [ ] **Step 1: Write failing tests for XP table**

```typescript
// server/__tests__/unit/xp-table.test.ts
import { describe, it, expect } from 'vitest'
import { getXpForSpar, QUICK_SPAR_XP } from '../../src/models/progression.js'

describe('XP Table', () => {
  it('should return correct XP for level 1 win', () => {
    expect(getXpForSpar(1, 'win', 1)).toBe(15)
  })
  it('should return correct XP for level 1 loss', () => {
    expect(getXpForSpar(1, 'loss', 1)).toBe(5)
  })
  it('should return draw XP as midpoint', () => {
    expect(getXpForSpar(1, 'draw', 1)).toBe(10) // (15+5)/2
  })
  it('should apply 2x multiplier for card spar', () => {
    expect(getXpForSpar(1, 'win', 2)).toBe(30)
  })
  it('should apply 4x multiplier for power spar', () => {
    expect(getXpForSpar(1, 'win', 4)).toBe(60)
  })
  it('should return correct XP for all levels 1-5', () => {
    expect(getXpForSpar(2, 'win', 1)).toBe(18)
    expect(getXpForSpar(3, 'win', 1)).toBe(20)
    expect(getXpForSpar(4, 'win', 1)).toBe(22)
    expect(getXpForSpar(5, 'win', 1)).toBe(25)
  })
  it('should fall back to level 5 XP for levels 6+', () => {
    expect(getXpForSpar(10, 'win', 1)).toBe(25)
  })
  it('should export QUICK_SPAR_XP table', () => {
    expect(QUICK_SPAR_XP[1]).toEqual({ win: 15, loss: 5 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd server && npx vitest run __tests__/unit/xp-table.test.ts`
Expected: FAIL — `getXpForSpar` is not exported

- [ ] **Step 3: Implement XP table and helper**

Add to `server/src/models/progression.ts`:

```typescript
export const QUICK_SPAR_XP: Record<number, { win: number; loss: number }> = {
  1: { win: 15, loss: 5 },
  2: { win: 18, loss: 6 },
  3: { win: 20, loss: 7 },
  4: { win: 22, loss: 8 },
  5: { win: 25, loss: 9 },
}

export function getXpForSpar(
  level: number,
  outcome: 'win' | 'loss' | 'draw',
  multiplier: number = 1,
): number {
  const effectiveLevel = Math.min(level, 5)
  const xpEntry = QUICK_SPAR_XP[effectiveLevel] || QUICK_SPAR_XP[5]
  let baseXp: number
  if (outcome === 'win') baseXp = xpEntry.win
  else if (outcome === 'loss') baseXp = xpEntry.loss
  else baseXp = Math.round((xpEntry.win + xpEntry.loss) / 2)
  return baseXp * multiplier
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd server && npx vitest run __tests__/unit/xp-table.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/models/progression.ts server/__tests__/unit/xp-table.test.ts
git commit -m "feat: add level-specific XP table and getXpForSpar helper"
```

---

### Task 2: Schema + Data Changes

**Files:**
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/db/connection.ts`
- Modify: `server/src/data/cards.json`
- Modify: `server/src/data/system-bots.json`
- Modify: `server/src/types/index.ts`

- [ ] **Step 1: Add `unlockedAtLevel` to cards.json**

Update each card in `server/src/data/cards.json` to include `"unlockedAtLevel"`:
- `spar`: 1, `focus`: 1, `rest`: 1
- `drill`: 2
- `study`: 3, `scout`: 3
- `power_spar`: 4, `deep_drill`: 4
- `challenge`: 5, `analyze`: 5

- [ ] **Step 2: Add boss gimmick data to system-bots.json**

Add `weakness`, `scoutText`, `playStyleHint` fields to system bots levels 1-5 in `server/src/data/system-bots.json`:

```json
{
  "level": 1, "name": "Pawn Pusher",
  "weakness": "Any coordinated piece play",
  "scoutText": "This opponent only pushes pawns early. Develop your pieces and you'll win.",
  "playStyleHint": "Extremely predictable opening moves."
}
```

(Similar for Knight Hopper, Bishop Sniper, Rook Roller, The Scholar)

- [ ] **Step 3: Add types to types/index.ts**

Add `unlockedAtLevel: number` to existing `CardDefinition` interface. Add:

```typescript
export interface LootResult {
  type: 'none' | 'insight' | 'energy' | 'card' | 'intel'
  data: any
}

export interface ChampionshipBout {
  id: number
  botId: number
  targetLevel: number
  gamesPlayed: number
  gamesWon: number
  currentRound: number
  status: 'active' | 'won' | 'lost'
  gameRecordIds: number[]
}
```

- [ ] **Step 4: Add `winStreak` to cardHands schema and `championshipBouts` table**

In `server/src/db/schema.ts`, add `winStreak` column to `cardHands`:
```typescript
winStreak: integer('win_streak').notNull().default(0),
```

Add new `championshipBouts` table:
```typescript
export const championshipBouts = sqliteTable('championship_bouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botId: integer('bot_id').notNull().references(() => bots.id),
  targetLevel: integer('target_level').notNull(),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  currentRound: integer('current_round').notNull().default(1),
  status: text('status').notNull().default('active'),
  gameRecordIdsJson: text('game_record_ids_json').notNull().default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
```

- [ ] **Step 5: Add CREATE TABLE + ALTER to connection.ts**

In `server/src/db/connection.ts`, add `win_streak INTEGER NOT NULL DEFAULT 0` to the `card_hands` CREATE TABLE statement. Add after existing table creation:

```typescript
// Championship bouts table
db.run(`CREATE TABLE IF NOT EXISTS championship_bouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL REFERENCES bots(id),
  target_level INTEGER NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  current_round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'won', 'lost')),
  game_record_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)`)

// Migration: add win_streak column for existing DBs
try { db.run(`ALTER TABLE card_hands ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0`) } catch {}
```

- [ ] **Step 6: Run full test suite to verify no breakage**

Run: `cd server && npx vitest run`
Expected: All 121 tests pass (schema changes are additive)

- [ ] **Step 7: Commit**

```bash
git add server/src/db/schema.ts server/src/db/connection.ts server/src/data/cards.json server/src/data/system-bots.json server/src/types/index.ts
git commit -m "feat: add championship_bouts table, win_streak column, card unlock levels, boss gimmick data"
```

---

### Task 3: ML Training Pipeline — Add Epochs Parameter

**Files:**
- Modify: `server/src/ml/training-pipeline.ts`

- [ ] **Step 1: Add optional `options` parameter to `trainBotFromGame`**

In `server/src/ml/training-pipeline.ts`, change the signature:

```typescript
export async function trainBotFromGame(
  db: DrizzleDb,
  botId: number,
  positions: PositionRecord[],
  result: GameResult,
  botColor: 'w' | 'b',
  botAttributes: BotAttributes,
  existingReplayBuffer?: Buffer | null,
  options?: { epochs?: number },
): Promise<TrainingResult & { updatedReplayBuffer: Buffer }> {
```

Then pass `options?.epochs` to the model.train call:
```typescript
const trainingResult = await model.train(trainingSamples, options?.epochs)
```

- [ ] **Step 2: Run existing ML tests to verify no breakage**

Run: `cd server && npx vitest run __tests__/unit/ml-training-pipeline.test.ts __tests__/unit/ml-learning.test.ts`
Expected: All 11 tests pass (parameter is optional, existing calls unchanged)

- [ ] **Step 3: Commit**

```bash
git add server/src/ml/training-pipeline.ts
git commit -m "feat: add optional epochs parameter to trainBotFromGame"
```

---

## Chunk 2: Core Services — Card Updates, Loot, Ladder Updates

### Task 4: CardService — Level Filtering + Energy Changes

> **Note:** This task must come before LootService (Task 5) because LootService depends on `randomDrawFiltered()` and `addCardToHand()` methods added here.

**Files:**
- Modify: `server/src/services/card.service.ts`
- Test: `server/__tests__/unit/card-level-filter.test.ts`

- [ ] **Step 1: Write failing tests for level-filtered draws and energy changes**

```typescript
// server/__tests__/unit/card-level-filter.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('CardService level filtering', () => {
  it('level 1 bot should only draw spar, focus, rest cards', () => { ... })
  it('level 3 bot should also draw drill, study, scout', () => { ... })
  it('level 5 bot should draw all 10 card types', () => { ... })
  it('drawHand should start energy at 0', () => { ... })
  it('refreshHand should preserve current energy', () => { ... })
  it('addEnergy should increment energy', () => { ... })
  it('addCardToHand should add card when hand < 10', () => { ... })
  it('addCardToHand should return false when hand has 10 cards', () => { ... })
  it('getWinStreak should return 0 for new bot', () => { ... })
  it('setWinStreak should update streak value', () => { ... })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd server && npx vitest run __tests__/unit/card-level-filter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement changes to CardService**

Modify `server/src/services/card.service.ts`:

1. Change `buildCardPool()` to include `unlockedAtLevel` from card definitions
2. Add `randomDrawFiltered(count: number, botLevel: number): HandCard[]` that filters `CARD_POOL` by `unlockedAtLevel <= botLevel`
3. Modify `drawHand(botId)` to:
   - Look up bot level, call `randomDrawFiltered(HAND_SIZE, bot.level)`
   - Set `energy: 0` instead of `energy: maxEnergy`
   - **Important:** The existing `POST /bots/:id/hand/draw` endpoint calls this — its behavior changes (energy starts at 0). This is intentional per spec.
4. Add `refreshHand(botId)` — draws new cards but preserves current energy (used by Rest card and "New Round" button)
5. Add `addEnergy(botId, amount)` — increments energy in DB
6. Add `addCardToHand(botId, card)` — appends card to hand JSON if under 10 cards, returns boolean
7. Add `getWinStreak(botId): number` — reads `win_streak` from card_hands row
8. Add `setWinStreak(botId, streak): void` — updates `win_streak` in card_hands row

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd server && npx vitest run __tests__/unit/card-level-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd server && npx vitest run`
Expected: All tests pass. Note: `dashboard.test.ts` may need updating if it expected non-zero initial energy — fix if needed.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/card.service.ts server/__tests__/unit/card-level-filter.test.ts
git commit -m "feat: level-filtered card draws, energy starts at 0, addEnergy/addCardToHand/streak methods"
```

---

### Task 5: Loot Service

**Files:**
- Create: `server/src/services/loot.service.ts`
- Create: `server/src/data/insights.json`
- Test: `server/__tests__/unit/loot-service.test.ts`

- [ ] **Step 1: Create insights.json**

```json
{
  "insights": {
    "1": [
      "Your bot hesitates in the opening — try learning a tactic!",
      "Pawn structure is loose. More drilling could help.",
      "Your bot tends to retreat when pressured.",
      "Early piece development is slow. An opening book would help.",
      "Your bot missed a simple capture opportunity."
    ],
    "2": [
      "Knight positioning could be sharper. Watch for forks!",
      "Your bot struggles when knights invade the center.",
      "Double attacks catch your bot off guard sometimes.",
      "Piece coordination is improving but still has gaps.",
      "Your bot sometimes blocks its own bishops."
    ],
    "3": [
      "Pin defense needs work — bishops are exploiting weak spots.",
      "Your bot doesn't always respond well to diagonal pressure.",
      "Skewer vulnerability detected along open files.",
      "Your bot's middlegame transitions are improving.",
      "Tactical awareness is growing but complex combos still slip by."
    ],
    "4": [
      "Endgame technique is the weakest area right now.",
      "Your bot trades down too eagerly when ahead.",
      "Rook endgames need more precision.",
      "Your bot sometimes misses passed pawn opportunities.",
      "Converting advantages to wins is getting better."
    ],
    "5": [
      "Your bot's style is becoming distinctive — keep training!",
      "Adaptability against varied opponents could improve.",
      "Complex positions with multiple threats still cause trouble.",
      "Your bot plays well in familiar openings but struggles in unknown territory.",
      "Almost PvP-ready. Consistency is the final frontier."
    ]
  }
}
```

- [ ] **Step 2: Write failing tests for LootService**

```typescript
// server/__tests__/unit/loot-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LootService } from '../../src/services/loot.service.js'
import { CardService } from '../../src/services/card.service.js'
import { LadderService } from '../../src/services/ladder.service.js'

describe('LootService', () => {
  // Tests mock Math.random to control loot outcomes
  it('should return "none" when roll < 0.50', () => { ... })
  it('should return "insight" when 0.50 <= roll < 0.70', () => { ... })
  it('should return "energy" when 0.70 <= roll < 0.85', () => { ... })
  it('should return "card" when 0.85 <= roll < 0.95', () => { ... })
  it('should return "intel" when roll >= 0.95', () => { ... })
  it('should return level-appropriate insight text', () => { ... })
  it('should re-roll card drop as energy when hand is full (10 cards)', () => { ... })
  it('should re-roll boss intel as energy when no ladder opponent', () => { ... })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `cd server && npx vitest run __tests__/unit/loot-service.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement LootService**

Create `server/src/services/loot.service.ts`:

```typescript
import type { DrizzleDb } from '../db/connection.js'
import type { LootResult, HandCard } from '../types/index.js'
import { CardService } from './card.service.js'
import { LadderService } from './ladder.service.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const insightsData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'insights.json'), 'utf-8'))

export class LootService {
  private cardService: CardService
  private ladderService: LadderService

  constructor(private db: DrizzleDb) {
    this.cardService = new CardService(db)
    this.ladderService = new LadderService(db)
  }

  rollLoot(botId: number, botLevel: number): LootResult {
    const roll = Math.random()
    if (roll < 0.50) return { type: 'none', data: null }
    if (roll < 0.70) return this.rollInsight(botLevel)
    if (roll < 0.85) return { type: 'energy', data: { amount: 1 } }
    if (roll < 0.95) return this.rollCardDrop(botId, botLevel)
    return this.rollBossIntel(botId)
  }

  private rollInsight(level: number): LootResult {
    const effectiveLevel = Math.min(Math.max(level, 1), 5)
    const pool = insightsData.insights[String(effectiveLevel)] || insightsData.insights['1']
    const text = pool[Math.floor(Math.random() * pool.length)]
    return { type: 'insight', data: { text } }
  }

  private rollCardDrop(botId: number, botLevel: number): LootResult {
    const handState = this.cardService.getHandState(botId)
    if (handState.cards.length >= 10) {
      return { type: 'energy', data: { amount: 1 } } // re-roll as energy
    }
    const cards = this.cardService.randomDrawFiltered(1, botLevel)
    if (cards.length === 0) return { type: 'energy', data: { amount: 1 } }
    const added = this.cardService.addCardToHand(botId, cards[0])
    if (!added) return { type: 'energy', data: { amount: 1 } }
    return { type: 'card', data: { card: cards[0] } }
  }

  private rollBossIntel(botId: number): LootResult {
    const scoutInfo = this.ladderService.getScoutInfo(botId)
    if (!scoutInfo) return { type: 'energy', data: { amount: 1 } } // re-roll
    return { type: 'intel', data: scoutInfo }
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `cd server && npx vitest run __tests__/unit/loot-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/services/loot.service.ts server/src/data/insights.json server/__tests__/unit/loot-service.test.ts
git commit -m "feat: add LootService with probability-based loot drops and insights data"
```

---

### Task 6: LadderService — Scout Info + Boss Loss Advice

**Files:**
- Modify: `server/src/services/ladder.service.ts`

- [ ] **Step 1: Update system-bots type annotation in ladder.service.ts**

The raw data type annotation near the top of `ladder.service.ts` currently only has `level`, `name`, `elo`, `description`. Update it to include the new gimmick fields added in Task 2:

```typescript
const rawData = require('../data/system-bots.json') as {
  systemBots: Array<{ level: number; name: string; elo: number; description?: string; weakness?: string; scoutText?: string; playStyleHint?: string }>
}
```

- [ ] **Step 2: Add `getScoutInfo(botId)` method**

```typescript
getScoutInfo(botId: number): { name: string; level: number; weakness: string; scoutText: string; playStyleHint: string } | null {
  const ladder = this.getLadderState(botId)
  if (!ladder) return null
  const nextOpp = ladder.opponents.find(o => !o.defeated)
  if (!nextOpp) return null
  const systemBot = this.getSystemBot(nextOpp.level) // NOTE: uses existing getSystemBot method
  return {
    name: nextOpp.name,
    level: nextOpp.level,
    weakness: systemBot?.weakness || 'No known weakness',
    scoutText: systemBot?.scoutText || 'No intel available.',
    playStyleHint: systemBot?.playStyleHint || 'Unknown play style.',
  }
}
```

- [ ] **Step 3: Add `getBossLossAdvice(botId)` method**

Returns training suggestion based on the current ladder opponent's weakness. Used for boss loss feedback UI.

```typescript
getBossLossAdvice(botId: number): { weakness: string; suggestedCard: string; suggestedAction: string } | null {
  const scoutInfo = this.getScoutInfo(botId)
  if (!scoutInfo) return null
  // Map weakness keywords to card suggestions
  const suggestion = this.mapWeaknessToCard(scoutInfo.weakness)
  return {
    weakness: scoutInfo.weakness,
    suggestedCard: suggestion.card,
    suggestedAction: suggestion.action,
  }
}

private mapWeaknessToCard(weakness: string): { card: string; action: string } {
  if (weakness.toLowerCase().includes('opening')) return { card: 'Study', action: 'Learn a new opening tactic' }
  if (weakness.toLowerCase().includes('endgame')) return { card: 'Drill', action: 'Drill your endgame tactics' }
  if (weakness.toLowerCase().includes('tactical') || weakness.toLowerCase().includes('fork') || weakness.toLowerCase().includes('pin'))
    return { card: 'Drill', action: 'Drill tactical defense patterns' }
  return { card: 'Spar', action: 'Keep training with more spars' }
}
```

- [ ] **Step 4: Run full test suite to verify no breakage**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ladder.service.ts
git commit -m "feat: add getScoutInfo and getBossLossAdvice to LadderService"
```

---

## Chunk 3: Quick Spar Endpoint

### Task 7: Quick Spar — Training Service Method

**Files:**
- Modify: `server/src/services/training.service.ts`
- Test: `server/__tests__/unit/quick-spar.test.ts`

- [ ] **Step 1: Write failing tests for quickSpar method**

```typescript
// server/__tests__/unit/quick-spar.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
// Tests use in-memory DB, create bot, run quickSpar, validate returns

describe('TrainingService.quickSpar', () => {
  it('should not deduct training points', () => { ... })
  it('should grant level-appropriate XP', () => { ... })
  it('should grant +1 energy', () => { ... })
  it('should increment win streak on win', () => { ... })
  it('should reset win streak on loss', () => { ... })
  it('should grant +2 bonus energy at streak >= 3', () => { ... })
  it('should not affect streak on draw', () => { ... })
  it('should use opponent level max(1, bot.level - 1)', () => { ... })
  it('should include loot result in response', () => { ... })
  it('should include key moments from match recap', () => { ... })
  it('should train ML with 6 epochs (0.5x)', () => { ... })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd server && npx vitest run __tests__/unit/quick-spar.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `quickSpar` method in TrainingService**

Add to `server/src/services/training.service.ts`:

```typescript
async quickSpar(botId: number): Promise<QuickSparResult> {
  const bot = /* load bot, validate exists */
  const opponentLevel = Math.max(1, bot.level - 1)

  // Build parameters (same pattern as cardSpar)
  const botParams = buildPlayParameters(bot, ...)
  const opponentParams = buildSystemBotParams(opponentLevel, ...)

  // Run game
  const gameResult = await simulateGame(whiteParams, blackParams, this.pool, ...)

  // ML training with reduced epochs (0.5x = 6 epochs)
  const mlTrainingResult = await trainBotFromGame(
    this.db, botId, gameResult.positions, gameResult.result, botColor,
    botAttributes, bot.mlReplayBuffer, { epochs: 6 }
  )

  // Save replay buffer
  this.db.update(bots).set({ mlReplayBuffer: mlTrainingResult.updatedReplayBuffer })...

  // Calculate outcome
  const botWon = /* standard check */
  const botLost = /* standard check */
  const outcome = botWon ? 'win' : botLost ? 'loss' : 'draw'

  // XP (level-specific table)
  const xpGained = getXpForSpar(bot.level, outcome, 1)

  // Elo
  const eloChange = calculateEloChange(bot.elo, opponentElo, gameResult.result, botIsWhite)
  const newElo = Math.max(100, bot.elo + eloChange)

  // Win streak (only affected by wins and losses, not draws)
  const cardService = new CardService(this.db)
  let streak = cardService.getWinStreak(botId)
  if (botWon) streak++
  else if (botLost) streak = 0
  // draws leave streak unchanged
  cardService.setWinStreak(botId, streak)

  // Energy: +1 base
  let energyEarned = 1
  cardService.addEnergy(botId, 1)

  // Streak bonus: +2 at 3+
  if (streak >= 3) {
    energyEarned += 2
    cardService.addEnergy(botId, 2)
  }

  // Loot
  const lootService = new LootService(this.db)
  const loot = lootService.rollLoot(botId, bot.level)
  if (loot.type === 'energy') {
    energyEarned += loot.data.amount
    cardService.addEnergy(botId, loot.data.amount)
  }
  // card drops handled inside LootService.rollCardDrop

  // Store game record
  const gameRecord = this.db.insert(gameRecords).values({...}).returning().get()

  // Update bot stats (NO training point deduction)
  this.db.update(bots).set({ elo: newElo, gamesPlayed: bot.gamesPlayed + 1, xp: bot.xp + xpGained })...

  // Training log
  this.db.insert(trainingLog).values({
    botId, level: bot.level, actionType: 'spar',
    detailsJson: JSON.stringify({ opponent: opponentDescription, quickSpar: true }),
    resultJson: JSON.stringify({ result: gameResult.result, eloChange, xpGained, energyEarned }),
  }).run()

  // Emotion + recap
  const emotion = generateEmotionResponse(outcome, 'spar', ...)
  const recap = generateMatchRecap(gameResult.positions, gameResult.result, botColor, ...)

  return {
    game: { id: gameRecord.id, result: gameResult.result, moveCount: gameResult.moveCount, ... },
    xpGained, eloChange, newElo, energyEarned, loot, streak,
    keyMoments: recap.keyMoments,
    mlTraining: { samplesUsed: mlTrainingResult.samplesUsed, finalLoss: ... },
    emotion, recap,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd server && npx vitest run __tests__/unit/quick-spar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/training.service.ts server/__tests__/unit/quick-spar.test.ts
git commit -m "feat: add quickSpar method with loot, streaks, and level-specific XP"
```

---

### Task 8: Quick Spar Route + Rate Limiter

**Files:**
- Create: `server/src/api/routes/quick-spar.routes.ts`
- Modify: `server/src/api/index.ts`
- Modify: `server/src/api/plugins/rate-limiter.ts`

- [ ] **Step 1: Add quickSparLimiter to rate-limiter.ts**

```typescript
export const quickSparLimiter = new RateLimiter(1, 1000) // 1 req per second
```

- [ ] **Step 2: Create quick-spar.routes.ts**

```typescript
// POST /bots/:id/quick-spar
// Auth required, bot ownership verified
// Rate limit: 1 req/sec per bot (keyed by `qspar:${botId}`)
// Returns: QuickSparResult
```

Route handler pattern matches existing training routes: load bot, verify owner, check rate limit, call `trainingService.quickSpar(botId)`, return result.

- [ ] **Step 3: Register routes in api/index.ts**

Add `createQuickSparRoutes(pool)` registration.

- [ ] **Step 4: Run full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/api/routes/quick-spar.routes.ts server/src/api/index.ts server/src/api/plugins/rate-limiter.ts
git commit -m "feat: add POST /bots/:id/quick-spar endpoint with 1req/sec rate limit"
```

---

## Chunk 4: Championship Bouts

### Task 9: Championship Service

**Files:**
- Create: `server/src/services/championship.service.ts`
- Test: `server/__tests__/unit/championship.test.ts`

- [ ] **Step 1: Write failing tests for championship lifecycle**

```typescript
describe('ChampionshipService', () => {
  it('should not start bout if ladder is incomplete', () => { ... })
  it('should not start bout if one is already active', () => { ... })
  it('should create active bout with round 1', () => { ... })
  it('should play a round and record result', () => { ... })
  it('should declare won after 2 wins (level up)', () => { ... })
  it('should declare lost after 2 losses (ladder reset)', () => { ... })
  it('should grant +3 energy on loss', () => { ... })
  it('should reset energy to 0 and refresh hand on win', () => { ... })
  it('should return correct round narrative titles', () => { ... })
  it('should allow resuming an active bout', () => { ... })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd server && npx vitest run __tests__/unit/championship.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ChampionshipService**

Create `server/src/services/championship.service.ts`:

Key methods:
- `startBout(botId)` — verify ladder complete + no active bout, create row, return state
- `playRound(botId)` — load active bout, run game vs target-level system bot, update bout, check if decided (2 wins/losses), trigger level-up or ladder reset
- `getActiveBout(botId)` — return active bout or null
- Round narrative: `['The Opening', 'The Counter', 'The Decider'][bout.currentRound - 1]`
- On win (status='won'): increment bot.level, reset energy to 0, call `cardService.drawHand(botId)` to refresh hand with new level pool, call `ladderService.resetLadder(botId, newTargetLevel)` then `ladderService.initLadder(botId)` for new ladder
- On loss (status='lost'): +3 bonus energy via `cardService.addEnergy(botId, 3)`, call `ladderService.resetLadder(botId, targetLevel)` then `ladderService.initLadder(botId)` to re-create the 3-opponent ladder at same target level

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd server && npx vitest run __tests__/unit/championship.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/championship.service.ts server/__tests__/unit/championship.test.ts
git commit -m "feat: add ChampionshipService with best-of-3 bout lifecycle"
```

---

### Task 10: Championship Routes

**Files:**
- Create: `server/src/api/routes/championship.routes.ts`
- Modify: `server/src/api/index.ts`
- Modify: `server/src/api/schemas/validation.ts`

- [ ] **Step 1: Create championship.routes.ts**

Two endpoints:
- `POST /bots/:id/championship/start` — auth, ownership check, call `championshipService.startBout(botId)`
- `POST /bots/:id/championship/play-round` — auth, ownership check, call `championshipService.playRound(botId)`

- [ ] **Step 2: Register routes in api/index.ts**

- [ ] **Step 3: Run full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/src/api/routes/championship.routes.ts server/src/api/index.ts server/src/api/schemas/validation.ts
git commit -m "feat: add championship bout start and play-round endpoints"
```

---

## Chunk 5: Dashboard Wiring + Card Route Updates

### Task 11: Dashboard — Add Streak, Championship, Context Cues

**Files:**
- Modify: `server/src/services/dashboard.service.ts`

- [ ] **Step 1: Add streak, championship, and contextCues to dashboard response**

```typescript
// In getBotDashboard(), add:
const streak = this.getWinStreak(botId)   // read from card_hands.win_streak
const championship = this.getChampionship(botId)  // read from championship_bouts
const contextCues = this.generateContextCues(bot, handState, ladderState)

// Return: { ...existing, streak, championship, contextCues }
```

Context cue logic (max one per call):
- If energy >= minimum card cost in hand → `{ type: 'energy_ready', text: 'Energy charged! Time for a card play?' }`
- If bot elo >= 0.8 * next ladder opponent elo → `{ type: 'boss_ready', text: 'Almost ready for [opponent]...' }`

- [ ] **Step 2: Run dashboard test**

Run: `cd server && npx vitest run __tests__/unit/dashboard.test.ts`
Expected: PASS (or update test expectations)

- [ ] **Step 3: Commit**

```bash
git add server/src/services/dashboard.service.ts
git commit -m "feat: add streak, championship, and contextCues to dashboard"
```

---

### Task 12: Card Route Updates + Boss Fight Endpoint

**Files:**
- Modify: `server/src/api/routes/card.routes.ts`

- [ ] **Step 1: Add `POST /bots/:id/hand/new-round` endpoint**

Acts as Rest card effect without needing one in hand. Calls `cardService.refreshHand(botId)`. Always available.

> **Note:** The existing `POST /bots/:id/hand/draw` endpoint calls `drawHand()` which resets energy to 0. `/hand/new-round` calls `refreshHand()` which preserves energy. Consider deprecating `/hand/draw` in favor of `/hand/new-round` for player-facing use. `/hand/draw` remains for internal use (level-up hand refresh).

- [ ] **Step 2: Update scout card effect to use gimmick data**

Change scout card handler to call `ladderService.getScoutInfo(botId)` and return the full gimmick data (weakness, scoutText, playStyleHint).

- [ ] **Step 3: Fix XP multipliers for card spar and power spar**

**Critical:** The current `card.routes.ts` passes `2` as xpMultiplier for power_spar. Per spec:
- Card Spar = 2x Quick Spar XP → multiplier `2`
- Power Spar = 4x Quick Spar XP (= 2x Card Spar) → multiplier `4`

Change power_spar handler from `trainingService.cardSpar(botId, oppLevel, 2)` to `trainingService.cardSpar(botId, oppLevel, 4)`.

Also update both spar/power_spar to use `getXpForSpar(bot.level, outcome, multiplier)` for level-appropriate XP instead of the flat `XP_PER_SPAR * multiplier`.

- [ ] **Step 4: Add `POST /bots/:id/boss-fight` endpoint**

Boss fights are **free** per spec — no energy cost. Add a dedicated endpoint:

```typescript
// POST /bots/:id/boss-fight
// Runs a game against the CURRENT ladder opponent (next undefeated)
// No energy cost — the gate is chess skill, not resources
// On win: marks ladder opponent as defeated
// On loss: returns getBossLossAdvice() + grants +3 energy
// Rate limit: 5-second cooldown between attempts (server enforced)
```

This uses `trainingService.cardSpar()` internally for the game simulation but does NOT deduct energy. The boss fight logic:
1. Get next undefeated ladder opponent via `ladderService.getNextOpponentLevel()`
2. Run game via `cardSpar(botId, oppLevel, 1)` (1x XP for boss fights)
3. On win: `ladderService.defeatOpponent(botId, oppIndex, gameRecordId)`
4. On loss: `cardService.addEnergy(botId, 3)` + return `ladderService.getBossLossAdvice(botId)`
5. Return full game result with enhanced key moments

- [ ] **Step 5: Run full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/api/routes/card.routes.ts
git commit -m "feat: add new-round and boss-fight endpoints, fix power spar 4x multiplier, enhanced scout"
```

---

## Chunk 6: Frontend

### Task 13: Quick Spar UI

**Files:**
- Modify: `server/src/public/index.html`
- Modify: `server/src/public/js/app.js`

- [ ] **Step 1: Add Quick Spar button to HTML**

In `index.html`, add a prominent "Train" button in the right column above the hand panel:

```html
<div class="quick-spar-area" id="quickSparArea">
  <button class="btn-quick-spar" id="quickSparBtn" onclick="doQuickSpar()">⚔️ Quick Spar</button>
  <div class="streak-display" id="streakDisplay"></div>
</div>
```

- [ ] **Step 2: Implement `doQuickSpar()` in app.js**

```javascript
async function doQuickSpar() {
  if (sparInProgress) return
  sparInProgress = true
  disableActions('Training...')
  try {
    const r = await api('POST', `/bots/${currentBotId}/quick-spar`)
    // Show result with key moments, loot, streak
    showQuickSparResult(r)
    await refreshDashboard()
  } catch (e) { addLog('Spar failed: ' + e.message, 'error') }
  finally { sparInProgress = false; enableActions() }
}
```

- [ ] **Step 3: Implement `showQuickSparResult()` with loot display**

Shows result card (win/loss/draw), XP earned, elo change, energy earned, loot drop (if any), streak status. Uses existing splash pattern for wins/losses.

- [ ] **Step 4: Add streak display to `refreshDashboard()`**

```javascript
// In refreshDashboard(), after loading dashboard:
const streakEl = document.getElementById('streakDisplay')
if (d.streak >= 3) {
  streakEl.innerHTML = `🔥 Streak: ${d.streak}x`
  streakEl.classList.add('hot-streak')
} else if (d.streak > 0) {
  streakEl.innerHTML = `Streak: ${d.streak}x`
  streakEl.classList.remove('hot-streak')
} else {
  streakEl.innerHTML = ''
}
```

- [ ] **Step 5: Add elo milestone detection**

Track `previousElo` in app state. After spar, check if crossed a 50 boundary:
```javascript
const oldMilestone = Math.floor(previousElo / 50)
const newMilestone = Math.floor(newElo / 50)
if (newMilestone > oldMilestone) {
  showMilestone(`Elo milestone: ${newMilestone * 50}!`)
}
```

- [ ] **Step 6: Add context cue display from dashboard**

```javascript
if (d.contextCues) {
  addLog(d.contextCues.text, 'context-cue')
}
```

- [ ] **Step 7: Test manually via dev server**

Run: `cd server && npm run dev`
Verify: Register → create bot → click Quick Spar → see result → energy increments → streak tracking → loot drops appear

- [ ] **Step 8: Commit**

```bash
git add server/src/public/index.html server/src/public/js/app.js
git commit -m "feat: add Quick Spar button with result display, streaks, elo milestones"
```

---

### Task 14: Hand + Ladder + Championship Frontend

**Files:**
- Modify: `server/src/public/js/hand.js`
- Modify: `server/src/public/js/ladder.js`
- Modify: `server/src/public/js/splash.js`
- Modify: `server/src/public/css/cards.css` (styling)

- [ ] **Step 1: Update hand.js for energy-from-0 and New Round**

- Initial energy display shows 0
- "New Round" button calls `POST /bots/:id/hand/new-round` (always available)
- Card unlock badges: newly available cards at current level get a "NEW!" badge
- Disabled cards show tooltip "Unlocks at Level X" if above bot level (shouldn't appear in hand, but defensive)

- [ ] **Step 2: Update ladder.js for boss fight buttons + championship bout UI**

Each undefeated ladder opponent gets a "Fight" button that calls `doBossFight()`. Boss fights are free (no energy cost). Add championship bout section:

```javascript
function renderLadder(d) {
  // Existing 3-opponent rendering...
  // For current (next undefeated) opponent, add: <button onclick="doBossFight()">⚔️ Fight</button>

  // Championship section
  if (d.championship && d.championship.status === 'active') {
    html += `<div class="championship-active">
      <h4>🏆 Championship — Round ${d.championship.currentRound}</h4>
      <p>Score: ${d.championship.gamesWon}-${d.championship.gamesPlayed - d.championship.gamesWon}</p>
      <button onclick="playChampionshipRound()">Play Round</button>
    </div>`
  } else if (d.ladder && d.ladder.allDefeated) {
    html += `<div class="championship-ready">
      <button onclick="startChampionship()">🏆 Start Championship Bout</button>
    </div>`
  }
}
```

- [ ] **Step 3: Add boss fight + championship functions to app.js**

```javascript
async function doBossFight() {
  disableActions('Boss fight...')
  try {
    const r = await api('POST', `/bots/${currentBotId}/boss-fight`)
    // Boss fights get enhanced display (longer, more dramatic)
    showBossFightResult(r)
    await refreshDashboard()
  } catch (e) { addLog('Boss fight failed: ' + e.message, 'error') }
  finally { enableActions() }
}

async function startChampionship() {
  const bout = await api('POST', `/bots/${currentBotId}/championship/start`)
  await refreshDashboard()
  addLog(`Championship started! Round 1: ${bout.roundTitle}`, 'championship')
}

async function playChampionshipRound() {
  disableActions('Championship round...')
  const result = await api('POST', `/bots/${currentBotId}/championship/play-round`)
  showChampionshipRoundResult(result)
  await refreshDashboard()
  enableActions()
}
```

- [ ] **Step 4: Update splash.js for championship splashes**

Add championship-specific splash variants:
- Championship round win/loss with round title
- Championship won: "CHAMPION!" with gold effects
- Championship lost: "Almost!" with encouragement + bonus energy display

- [ ] **Step 5: Add boss loss feedback display**

After boss fight loss, show:
- Weakness identified from game analysis
- Suggested card play
- +3 energy animation

- [ ] **Step 6: Test manually via dev server**

Run: `cd server && npm run dev`
Verify full L1-L5 flow: Quick Spar → earn energy → play cards → defeat ladder opponents → start championship → best-of-3 → level up → repeat

- [ ] **Step 7: Commit**

```bash
git add server/src/public/js/hand.js server/src/public/js/ladder.js server/src/public/js/splash.js server/src/public/js/app.js server/src/public/css/cards.css
git commit -m "feat: championship bout UI, energy-from-0, boss loss feedback, card unlock badges"
```

---

## Chunk 7: Integration + Final Verification

### Task 15: Full Integration Test

**Files:**
- Modify: `server/__tests__/integration/e2e-flow.test.ts` (optional — add quick spar to journey)

- [ ] **Step 1: Run full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass (target: ~130+ tests with new unit tests)

- [ ] **Step 2: Manual E2E test via dev server**

Run: `cd server && npm run dev`

Full gameplay test checklist:
1. Register + create bot → see 7 cards (spar/focus/rest only at L1), energy at 0
2. Click Quick Spar → game runs → result card with XP + energy + possible loot
3. Repeat spars → streak builds → fire emoji at 3x → bonus energy
4. Play a Spar card (costs 2 energy) → 2x XP
5. Defeat warm-up ladder opponent via spar card
6. Defeat rival and gatekeeper
7. Start championship → play rounds → level up
8. New level: new cards available, energy reset to 0, hand refreshed
9. Repeat to L5

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete gameplay progression L1-L5 implementation"
```

---

## Verification Summary

| Check | Method |
|-------|--------|
| XP table accuracy | Unit tests (Task 1) |
| Loot probabilities | Unit tests with mocked Math.random (Task 4) |
| Card level filtering | Unit tests (Task 5) |
| Quick spar XP/energy/streak | Unit tests (Task 7) |
| Championship lifecycle | Unit tests (Task 9) |
| No regressions | Full `npx vitest run` after each task |
| E2E gameplay flow | Manual testing via dev server (Task 15) |
| Existing 121 tests pass | Verified at each commit |

## Deferred Items

- Async quick spar with loading animation (keep synchronous for now — depth 3-5 games typically take 5-30s)
- Expanded bot terrarium reaction messages (existing `generateEmotionResponse` is sufficient)
- Enhanced 15-second boss fight replay display (use existing splash pattern initially)
- Escalating championship visual intensity (particle effects, glows per round)
- Sound effects
- Card drop re-rolls as energy when hand is full (intentional enhancement over spec's "skipped")
- LootService.rollLoot simplified signature (no isWin/streakCount params — probabilities are fixed regardless)
- Deprecate `/hand/draw` endpoint in favor of `/hand/new-round` (both kept for now)
