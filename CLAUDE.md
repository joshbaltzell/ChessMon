# ChessMon - Chess Bot Training Game

## What Is This?

ChessMon is a chess bot training game built on top of a forked chess.js library. Players register, create a named bot with RPG-style attributes and a chess-themed alignment, then train their bot through sparring, tactic purchases, drilling, and level testing. Bots learn via real ML (TensorFlow.js) and develop unique play styles based on their attributes. The visual aesthetic uses ASCII art that evolves as the bot levels up.

The game features a card-based preparation system with three card categories (preparation buffs, fight powerups, utility), a spar timer with cooldowns, enhanced bosses with special abilities, pilot mode (play AS your bot for 1.5x XP), autonomous overnight fights, and daily quests with streak rewards. The UI uses a screen-based state machine with 5 focused screens.

## Quick Start

```bash
# 1. Build chess.js (required - server depends on it via file:..)
npm run build

# 2. Install server deps
cd server && npm install

# 3. Run tests
cd server && npm test

# 4. Start dev server (port 3000)
cd server && npm run dev

# 5. Or start with in-memory DB for testing
cd server && DB_PATH=":memory:" npx tsx src/index.ts
```

## Critical Rules

- **Do NOT modify `src/chess.ts` or the root `__tests__/`** — that's the upstream chess.js fork.
- **All game server code lives under `server/`**.
- **Always build chess.js first** (`npm run build` from root) before running the server — the server depends on it via `file:..`.
- **Tests must pass before committing** — run `cd server && npx vitest run` to verify.

## Project Structure

The root is a **forked chess.js v1.4.0**. All game server code lives under `server/`.

```
server/
  src/
    index.ts                          # Fastify bootstrap, error handler, 404 handler
    config.ts                         # Env config (port, pool size, JWT secret, etc.)

    api/
      index.ts                        # Route registration (9 route modules)
      plugins/auth-plugin.ts          # JWT auth decorator (request.user.playerId)
      plugins/rate-limiter.ts         # In-memory rate limiting (auth, heavy, play, quickSpar, general)
      routes/
        auth.routes.ts                # POST /register, /login
        bot.routes.ts                 # Bot CRUD, dashboard, leaderboard
        card.routes.ts                # Card hand, play card, boss fights, ladder
        catalog.routes.ts             # Public: tactics, openings, alignments, cosmetics, guide, onboarding
        championship.routes.ts        # Championship bout start/play/status
        level-test.routes.ts          # Level test start + results
        pilot.routes.ts               # Pilot mode (play AS bot vs system opponent)
        play.routes.ts                # Human vs bot (new, move, resign)
        quick-spar.routes.ts          # Timed spar with cooldown + streak reduction
        training.routes.ts            # Spar, purchase tactic, drill, training log
      schemas/validation.ts           # Zod schemas + parseOrThrow helper

    db/
      connection.ts                   # SQLite + Drizzle (WAL mode)
      schema.ts                       # 10 tables (see Database section)
      seed.ts                         # System data seeder

    engine/
      stockfish-pool.ts               # Worker pool for Stockfish WASM (child_process.fork)
      buff-resolver.ts                # Pure function: applyBuffs(PlayParameters, ActiveBuff[]) -> PlayParameters; powerup state machine
      game-simulator.ts               # Runs complete bot-vs-bot games (supports powerup triggers)
      move-selector.ts                # Core AI: opening book -> blunder check -> Stockfish candidates -> attribute scoring -> ML blend -> softmax selection
      opening-book.ts                 # FEN-indexed opening position lookup
      concurrency-limiter.ts          # Semaphore for expensive operations

    ml/
      preference-model.ts             # TensorFlow.js Sequential: 128->64->32->1 sigmoid
      training-pipeline.ts            # Post-game labeling: position records -> training samples
      feature-extractor.ts            # Board + move + context -> 128-dim Float32Array
      model-store.ts                  # Serialize/deserialize model weights to DB blob
      style-probe.ts                  # Measures bot's learned style via diagnostic positions (5-dim profile)
      generate-archetypes.ts          # Offline script: pre-trained archetype models per alignment (npx tsx src/ml/generate-archetypes.ts)

    models/
      bot-intelligence.ts             # Maps bot record -> PlayParameters
      progression.ts                  # 20 levels, costs, XP, level test requirements
      elo.ts                          # Elo rating calculation
      personality.ts                  # Emotion responses by alignment
      battle-commentary.ts            # Match recap with key moment detection
      game-guide.ts                   # Structured game mechanics + onboarding
      cosmetics.ts                    # ASCII art tiers, skins, design packs

    services/
      auth.service.ts                 # Register/login with bcrypt
      auto-fight.service.ts           # Autonomous bot fights while player is away
      bot.service.ts                  # Bot CRUD, validation, leaderboard
      card.service.ts                 # Card hand draw/play, buff queueing, energy management
      championship.service.ts         # Championship bout orchestration (boss fights)
      daily-quest.service.ts          # Daily quest generation, progress tracking, streak rewards
      dashboard.service.ts            # Comprehensive bot dashboard (includes overnight report + quests)
      ladder.service.ts               # 3-opponent ladder per level, boss special abilities
      level-test.service.ts           # Multi-game level test orchestration
      loot.service.ts                 # Post-spar loot rolls with streak multipliers
      pilot.service.ts                # Pilot mode: human plays AS bot, 1.5x XP, ML training
      play.service.ts                 # Human vs bot game sessions
      training.service.ts             # Spar, purchase tactic, drill (with ML training + buff consumption)

    types/index.ts                    # Shared types, constants (CardDefinition, HandCard, HandState, LootResult, etc.)
    data/
      archetypes.json                 # Pre-trained ML weights per alignment (~1.1MB)
      cards-v2.json                   # Card definitions: preparation, powerup, utility categories
      cards.json                      # Legacy card definitions (replaced by cards-v2.json)
      cosmetics.json                  # Skins, design packs, ASCII art
      insights.json                   # Level-based training insights (loot text)
      openings.json                   # 20 curated opening books with FEN positions
      system-bots.json                # System bot configs per level (with specialAbility + counterPrep)
      tactics.json                    # 21 tactics (6 are openings)

  __tests__/
    unit/                             # 20 unit test files
    integration/e2e-flow.test.ts      # Full player journey test
```

## Tech Stack

- **Fastify v5** REST API with JWT auth (`@fastify/jwt`)
- **SQLite** via `better-sqlite3` + **Drizzle ORM** (WAL mode)
- **Stockfish 18** WASM via `child_process.fork` worker pool
- **TensorFlow.js** (`@tensorflow/tfjs-node`) — real gradient descent ML per bot
- **Zod** for request validation
- **Vitest** for testing
- **TypeScript** (ES2022 target, Node16 module resolution, strict mode)

## Core Game Mechanics

### Bot Attributes (50 points total, each 0-20)
- **Aggression**: Prefers captures, checks, king attacks
- **Positional**: Trusts engine's top evaluation
- **Tactical**: Favors moves with large eval swings
- **Endgame**: Plays more accurately in endgame positions
- **Creativity**: Increases randomness (softmax temperature)

### Chess Alignment (3x3 grid)
- **Attack axis**: aggressive / balanced / defensive
- **Style axis**: chaotic / positional / sacrificial
- Each combination provides mechanical bonuses, unique personality/dialogue, and a pre-trained archetype model

### Card System (v2 — Preparation + Powerups)
Cards are strategic pre-fight loadout building, not an action menu:
- **Three categories**:
  - **Preparation**: Buffs applied to next fight's PlayParameters (e.g. Sharpen +2 depth, Iron Defense -50% blunder rate, Tactical Focus +0.4 tactical weight)
  - **Powerup**: One-shot triggers during fights (e.g. Second Wind +3 depth if losing at move 20+, Lucky Break skip next blunder, Adrenaline halve temperature for 10 moves)
  - **Utility**: Immediate non-combat effects (Focus +1 energy, Rest redraw hand, Scout reveal boss weakness, Haste reduce spar timer)
- **Hand**: Draw 7 cards from a weighted pool, play by spending energy
- **Energy**: Level-dependent starting amount, replenished by Focus cards, loot, and quest rewards
- **Loadout display**: Shows queued buffs and powerups before fights
- Cards unlock at different levels (1-5 gating)
- Card definitions in `cards-v2.json`
- Buff resolution in `engine/buff-resolver.ts`

### Spar Timer
- Free spars run on a 5-minute cooldown (300s default)
- Tracked server-side via `nextFreeSparAt` column on bots
- Win streaks of 3+ reduce timer by 30s per streak (floor: 120s / 2 min)
- Haste prep card reduces next cooldown by 60s
- Dashboard shows live countdown; button pulses when ready
- Routes: `GET /bots/:id/spar-timer`, `POST /bots/:id/quick-spar`, `POST /bots/:id/reduce-spar-timer`

### Pilot Mode
- Human plays AS their bot against a system opponent (not against the bot)
- Earns 1.5x XP and Elo changes vs system level
- Post-game: ML trains on human positions, bot learns player's style
- Opening book suggestions shown as green ghost highlights on board
- Routes: `POST /bots/:id/pilot/new`, `/pilot/:sessionId/move`, `/pilot/:sessionId/resign`

### Loot System
After sparring, bots receive loot with streak multipliers:
- **Insight** (~20%): Level-appropriate training tips
- **Energy** (~15%): +1 energy (or +2 at 5+ streak)
- **Card drop** (~10%): Random card added to hand
- **Boss intel** (~5%): Info about next ladder opponent
- **Nothing** (~50%): No loot (drops to ~25% at 5+ win streak)

### Daily Quests + Streak System
- 3 daily quests per bot, generated from a level-appropriate pool
- Quest types: win_spars, play_cards, earn_xp, use_prep_cards, beat_boss, win_streak, pilot_win, gain_elo
- Streak rewards for consecutive daily check-ins: Day 1-2: +2 energy, Day 3-5: +3 energy, Day 6+: +5 energy

### Autonomous Bot Activity
- On dashboard load, bot simulates fights for time away (1 per 30min, max 8/day)
- Lightweight simulation: no Stockfish, Elo-based outcome probabilities
- Meaningful Elo swings (±10-15), small XP gains (~30% of active play)
- Morning briefing shows overnight results on return

### Progression (20 levels)
- Levels 1-5: Elo 400-800, depth 3-5, 15-11% blunder rate
- Levels 6-10: Elo 900-1300, depth 6-8, 10-6% blunder rate
- Levels 11-15: Elo 1400-1800, depth 9-12, 5-1% blunder rate
- Levels 16-20: Elo 1900-2400, depth 13-20, 0% blunder rate

### Ladder System + Enhanced Bosses
- Each level has a 3-opponent ladder of system bots
- Opponents must be defeated sequentially (index 0, 1, 2)
- Defeating all 3 unlocks the championship bout (boss fight)
- Progress persisted in `ladder_progress` table
- **Boss special abilities**: Each system bot has a unique ability that modifies its PlayParameters (e.g. "Pawn Storm" +0.3 aggression, "Fortress" -50% blunder rate, "Perfect Calculation" +4 depth)
- **Counter-prep**: Scout card reveals boss weakness + suggests which prep cards counter it
- **Boss loss consolation**: +3 energy + advice on how to beat the boss
- `getBossPlayParameters(level)` in `ladder.service.ts` applies abilities to base system params

### Championship Bouts
- Boss fight to advance to the next level
- Multi-round format tracked in `championship_bouts` table
- Replaces the old level test for progression

### Level Tests (legacy)
- Play 3-5 games against system/player bots, win threshold to advance
- Failed test gives +5 bonus training points

### Move Selection Algorithm (move-selector.ts)
1. Opening book check (owned tactic + proficiency roll)
2. Blunder check (random legal move if triggered)
3. Stockfish candidates (multipv 5)
4. Attribute scoring (aggression, positional, tactical, endgame bonuses)
5. ML preference blend (0.7 * score + 0.3 * ml_preference when model exists)
6. Softmax selection (temperature from creativity)

### ML Model (preference-model.ts)
- Architecture: Dense 128->64 ReLU -> Dropout 0.2 -> Dense 32 ReLU -> Dropout 0.1 -> Dense 1 Sigmoid
- Training: After each spar, `model.fit()` with labeled positions from the game
- Labels: high (0.85-0.95) for top moves in wins, low (0.1-0.2) for bad moves in losses
- Weights stored as JSON blob in `bots.ml_weights_blob` (~200KB)
- Uses `movePlayedUci` field for accurate candidate matching (not SAN)
- **Style probe**: Diagnostic positions test model preferences across 5 dimensions (aggressiveness, positionality, tacticalSharpness, endgameGrip, unpredictability)
- **Archetype models**: Pre-trained weights per alignment in `archetypes.json`, giving new bots an initial personality

## API Routes (prefix: `/api/v1`)

### Public
- `GET /health` — server + stockfish pool status
- `POST /auth/register` — `{username, password}` -> `{token, player}`
- `POST /auth/login` — `{username, password}` -> `{token, player}`
- `GET /bots/leaderboard` — `?limit=20&offset=0`
- `GET /catalog/tactics` — all purchasable tactics
- `GET /catalog/openings` — opening book catalog
- `GET /catalog/alignments` — alignment options
- `GET /catalog/cosmetics` — skins and design packs
- `GET /catalog/guide` — structured game mechanics
- `GET /catalog/onboarding` — first-bot creation guide with sample builds

### Authenticated (Bearer token)
- `POST /bots` — `{name, aggression, positional, tactical, endgame, creativity, alignment_attack, alignment_style}` (sum=50, each 0-20)
- `GET /bots/mine` — player's bots (max 3)
- `GET /bots/:id` — single bot detail
- `GET /bots/:id/dashboard` — comprehensive single-call dashboard
- **Training**:
  - `POST /bots/:id/train/spar` — `{opponent:"system", opponent_level:1}` -> game result + ML training + match recap
  - `POST /bots/:id/train/purchase` — `{tactic_key:"italian_game"}`
  - `POST /bots/:id/train/drill` — `{tactic_key:"italian_game"}`
  - `GET /bots/:id/training-log`
- **Cards**:
  - `GET /bots/:id/hand` — get current card hand (auto-draws if none exists)
  - `POST /bots/:id/hand/draw` — draw a new hand
  - `POST /bots/:id/hand/new-round` — refresh hand (preserves energy)
  - `POST /bots/:id/hand/play` — `{card_id}` -> play a card (queues buff/powerup or immediate effect)
  - `GET /bots/:id/ladder` — get ladder state
  - `POST /bots/:id/boss-fight` — fight next ladder boss (consumes buffs/powerups)
  - `GET /catalog/cards` — all card definitions
- **Timed Spar**:
  - `GET /bots/:id/spar-timer` — get timer state (ready, remainingMs, streak)
  - `POST /bots/:id/quick-spar` — timed spar with cooldown gate, grants XP + energy + loot
  - `POST /bots/:id/reduce-spar-timer` — reduce timer by 60s (Haste card)
- **Pilot Mode**:
  - `POST /bots/:id/pilot/new` — `{player_color, opponent_level}` -> start pilot game
  - `POST /bots/:id/pilot/:sessionId/move` — `{move, opponent_level}` -> make move, opponent responds
  - `POST /bots/:id/pilot/:sessionId/resign` — resign pilot game
- **Championship**:
  - `POST /bots/:id/championship/start` — begin championship bout
  - `POST /bots/:id/championship/play` — play next game in bout
  - `GET /bots/:id/championship/status` — current bout status
- **Level Tests**:
  - `POST /bots/:id/level-test` — runs 3-5 games, returns pass/fail + details
  - `GET /bots/:id/level-tests` — all test history
- **Human Play**:
  - `POST /bots/:id/play/new` — `{player_color:"w"}` -> session with bot's first move if black
  - `POST /bots/:id/play/:sessionId/move` — `{move:"e4"}` (SAN) -> bot reply
  - `POST /bots/:id/play/:sessionId/resign` — no body needed (don't set Content-Type)

## Database

SQLite with Drizzle ORM. 11 tables defined in `server/src/db/schema.ts`:

| Table | Purpose |
|-------|---------|
| `players` | User accounts (username, password hash, cosmetics) |
| `bots` | Bot state (attributes, level, XP, elo, ML weights, spar timer, activity tracking) |
| `bot_tactics` | Owned tactics with proficiency (unique on bot_id + tactic_key) |
| `training_log` | History of all training actions |
| `game_records` | PGN records of all games played |
| `level_tests` | Level test attempts and results |
| `card_hands` | Card hand state (energy, cards, active buffs/powerups, win streak) |
| `championship_bouts` | Championship/boss fight progress |
| `ladder_progress` | 3-opponent ladder state per level |
| `play_sessions` | Human vs bot and pilot game sessions (UUID primary key) |
| `daily_quests` | Daily quest tracking (type, progress, completion, rewards) |

Key constraints:
- Bot attributes must sum to 50, each 0-20
- Max 3 bots per player
- Bot names are unique globally
- `bot_tactics` has unique index on (bot_id, tactic_key)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Bind address |
| `DB_PATH` | ./chessmon.db | SQLite path (`:memory:` for tests) |
| `JWT_SECRET` | chessmon-dev-secret-change-in-production | JWT signing key |
| `JWT_EXPIRES_IN` | 7d | Token expiration |
| `STOCKFISH_POOL_SIZE` | cpus-2 | Stockfish worker count (min 4) |
| `STOCKFISH_TIMEOUT_MS` | 30000 | Per-request timeout |
| `ML_MODEL_CACHE_SIZE` | 50 | LRU cache for loaded models |
| `MAX_CONCURRENT_SPARS` | 8 | Concurrency limiter |
| `MAX_CONCURRENT_LEVEL_TESTS` | 4 | Concurrency limiter |
| `DEV_MODE` | auto | Set `DEV_MODE=1` or inferred from `NODE_ENV !== 'production'` |

## Testing

```bash
cd server
npm test              # Run all tests (watch mode)
npx vitest run        # Run once
npx vitest run __tests__/unit/some-test.test.ts  # Run specific test
```

**Test configuration** (`server/vitest.config.ts`):
- `globals: true` — no need to import `describe`/`it`/`expect`
- `environment: 'node'`
- `testTimeout: 30000` (30s per test)
- Pattern: `__tests__/**/*.test.ts`

**Test files** (21 total):
- 20 unit tests in `server/__tests__/unit/`
- 1 integration E2E test in `server/__tests__/integration/e2e-flow.test.ts`

Tests use `DB_PATH=":memory:"` and a 2-worker Stockfish pool. The E2E test exercises the full player journey: register -> create bot -> spar -> purchase tactic -> drill -> leaderboard. Has a 2-minute timeout for Stockfish games.

## Code Conventions

### File Organization
- Routes in `api/routes/*.routes.ts` — each exports a function or factory that takes `StockfishPool`
- Services in `services/*.service.ts` — classes with `DrizzleDb` constructor injection
- Route factories pattern: `createXxxRoutes(pool: StockfishPool)` returns an async Fastify plugin
- All imports use `.js` extension (ESM with Node16 module resolution)
- JSON data files loaded via `readFileSync` or `createRequire` (both patterns used)

### Error Handling Pattern
- Routes use `Object.assign(new Error('message'), { statusCode: 4xx, code: 'ERROR_CODE' })` for structured errors
- Or `reply.status(4xx).send({ error: 'message', code: 'ERROR_CODE' })` directly
- Zod validation via `parseOrThrow(schema, data)` helper

### Authentication Pattern
- `app.authenticate` as `onRequest` hook for protected routes
- `request.user.playerId` available after authentication
- Bot ownership check: load bot, verify `bot.playerId === request.user.playerId`

### Formatting & Linting (root chess.js)
- **Prettier**: no semicolons, single quotes, 80-char markdown, 2-space JSON
- **ESLint**: strictCamelCase for identifiers, UPPER_CASE for constants, PascalCase for types, starred-block multiline comments
- Root `npm run check` runs format + lint + test + build + api-extractor

### TypeScript
- Strict mode enabled
- Root chess.js: ESNext target, Node16 module
- Server: ES2022 target, Node16 module resolution
- `type` imports used for type-only imports
- Server and root chess.js have separate tsconfig files

## Known Design Decisions

- **chess.js is NOT modified** — it's the upstream fork, all game logic goes in `server/`
- **Stockfish uses child_process.fork**, not worker_threads, for WASM compatibility
- **ML model per bot** — each bot has its own TensorFlow.js Sequential model stored as a JSON blob
- **Rate limiting is in-memory** — resets on server restart, fine for single-instance
- **Opening books are FEN-indexed** — the FEN prefix (first 4 parts) is used as lookup key
- **Resign endpoint** doesn't accept a body — don't send Content-Type: application/json
- **Archetype models are pre-generated offline** — run `npx tsx src/ml/generate-archetypes.ts` to regenerate
- **Card system is preparation-based** — cards queue buffs/powerups for fights, not direct actions
- **Buff resolver is a pure function** — `applyBuffs(PlayParameters, ActiveBuff[])` modifies play params
- **Spar timer is server-side** — prevents client-side manipulation of cooldowns
- **Autonomous fights are calculated on return** — no background process, simulated on dashboard load
- **Pilot mode trains ML on human positions** — teaches bot the player's play style
- **Boss special abilities modify PlayParameters** — each system bot has unique game-altering effects
- **Ladder + championship replaces level tests** as the primary progression path
- **UI uses screen-based state machine** — 5 screens (HOME, PREP, LADDER, PILOT, FIGHT), one visible at a time

## CI/CD

GitHub Actions (`.github/workflows/node.js.yml`):
- Triggers on push/PR to `master`
- Tests against Node.js 20.x, 22.x, 24.x on ubuntu-latest
- Runs `npm ci` then `npm run check` (format + lint + vitest + build + api-extractor)
- This is for the **root chess.js library only** — server tests are not included in CI

## Frontend

A vanilla HTML/CSS/JS frontend exists in `server/src/public/` served via `@fastify/static`:
- `index.html` — main entry point
- `css/` — 9 stylesheets: board, cards, hand, ladder, layout, log, splash, terrarium, theme
- `js/` — 13 modules: app, board, cards, dev, hand, ladder, log, pilot, pixel-art, play, replay, splash, terrarium

## Engagement Loop Architecture

| Loop | Duration | Mechanic | "One More" Hook |
|------|----------|----------|-----------------|
| **Micro** | 30 sec | Play a prep card | "I still have 2 cards and energy left" |
| **Short** | 2-5 min | Spar timer fires -> fight -> loot | "Timer almost ready again, let me prep" |
| **Medium** | 15-30 min | Defeat a ladder miniboss | "Just 1 more boss to unlock championship" |
| **Long** | 1-2 hrs | Clear championship -> level up | "New cards unlock at next level" |
| **Daily** | 24 hrs | Overnight report + quests + streak | "Don't break my 7-day streak" |

## What's Next (potential improvements)

- Frontend framework (React/Next.js or mobile)
- WebSocket for real-time play instead of request-response
- PostgreSQL migration for multi-instance deployment
- Redis for distributed rate limiting and session storage
- Bot-vs-bot matchmaking between player bots
- More opening books and tactical puzzles
- Replay viewer with move-by-move commentary
- Achievement system and collection milestones
- Tournament brackets between player bots
