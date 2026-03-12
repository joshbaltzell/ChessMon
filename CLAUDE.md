# ChessMon - Chess Bot Training Game

## What Is This?

ChessMon is a chess bot training game built on top of a forked chess.js library. Players register, create a named bot with RPG-style attributes and a chess-themed alignment, then train their bot through sparring, tactic purchases, drilling, and level testing. Bots learn via real ML (TensorFlow.js) and develop unique play styles based on their attributes. The visual aesthetic uses ASCII art that evolves as the bot levels up.

## Quick Start

```bash
# 1. Build chess.js (required - server depends on it via file:..)
npm run build

# 2. Install server deps
cd server && npm install

# 3. Run tests (581 tests)
npm test

# 4. Start dev server (port 3000)
npm run dev

# 5. Or start with in-memory DB for testing
DB_PATH=":memory:" npx tsx src/index.ts
```

## Project Structure

The root is a **forked chess.js v1.4.0** — do NOT modify `src/chess.ts` or the root `__tests__/`. All game server code lives under `server/`.

```
server/
  src/
    index.ts                          # Fastify bootstrap, error handler, 404 handler
    config.ts                         # Env config (port, pool size, JWT secret, etc.)

    api/
      index.ts                        # Route registration
      plugins/auth-plugin.ts          # JWT auth decorator (request.user.playerId)
      plugins/rate-limiter.ts         # In-memory rate limiting (auth, heavy, play, general)
      routes/
        auth.routes.ts                # POST /register, /login
        bot.routes.ts                 # Bot CRUD, dashboard, leaderboard
        training.routes.ts            # Spar, purchase tactic, drill, training log
        level-test.routes.ts          # Level test start + results
        play.routes.ts                # Human vs bot (new, move, resign)
        catalog.routes.ts             # Public: tactics, openings, alignments, cosmetics, guide, onboarding
      schemas/validation.ts           # Zod schemas + parseOrThrow helper

    db/
      connection.ts                   # SQLite + Drizzle (WAL mode)
      schema.ts                       # 6 tables: players, bots, bot_tactics, training_log, game_records, level_tests, play_sessions
      seed.ts                         # System data seeder

    engine/
      stockfish-pool.ts               # Worker pool for Stockfish WASM (child_process.fork)
      game-simulator.ts               # Runs complete bot-vs-bot games
      move-selector.ts                # Core AI: opening book -> blunder check -> Stockfish candidates -> attribute scoring -> ML blend -> softmax selection
      opening-book.ts                 # FEN-indexed opening position lookup
      concurrency-limiter.ts          # Semaphore for expensive operations

    ml/
      preference-model.ts             # TensorFlow.js Sequential: 128->64->32->1 sigmoid
      training-pipeline.ts            # Post-game labeling: position records -> training samples
      feature-extractor.ts            # Board + move + context -> 128-dim Float32Array
      model-store.ts                  # Serialize/deserialize model weights to DB blob

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
      bot.service.ts                  # Bot CRUD, validation, leaderboard
      training.service.ts             # Spar, purchase tactic, drill (with ML training)
      level-test.service.ts           # Multi-game level test orchestration
      play.service.ts                 # Human vs bot game sessions
      dashboard.service.ts            # Comprehensive bot dashboard aggregation

    types/index.ts                    # Shared types, constants
    data/
      openings.json                   # 20 curated opening books with FEN positions
      tactics.json                    # 21 tactics (6 are openings)
      system-bots.json                # System bot configs per level
      cosmetics.json                  # Skins, design packs, ASCII art

  __tests__/
    unit/                             # 14 unit test files
    integration/e2e-flow.test.ts      # Full player journey test
```

## Tech Stack

- **Fastify v5** REST API with JWT auth (`@fastify/jwt`)
- **SQLite** via `better-sqlite3` + **Drizzle ORM** (WAL mode)
- **Stockfish 18** WASM via `child_process.fork` worker pool
- **TensorFlow.js** (`@tensorflow/tfjs-node`) — real gradient descent ML per bot
- **Zod** for request validation
- **Vitest** for testing

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
- Each combination provides mechanical bonuses and unique personality/dialogue

### Training Actions
- **Spar** (2 pts): Play a game vs system bot, gain XP, ML trains on the game
- **Purchase tactic** (3 pts): Buy an opening/tactic from the catalog
- **Drill** (1 pt): Increase proficiency on an owned tactic (+15)

### Progression (20 levels)
- Levels 1-5: Elo 400-800, depth 3-5, 15-11% blunder rate
- Levels 6-10: Elo 900-1300, depth 6-8, 10-6% blunder rate
- Levels 11-15: Elo 1400-1800, depth 9-12, 5-1% blunder rate
- Levels 16-20: Elo 1900-2400, depth 13-20, 0% blunder rate
- Level test: play 3-5 games against system/player bots, win threshold to advance
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
- `GET /bots/:id/dashboard` — comprehensive single-call dashboard (identity, stats, attributes, training, tactics, appearance, mood, recentGames, levelTest, nextChallenge)
- `POST /bots/:id/train/spar` — `{opponent:"system", opponent_level:1}` -> game result + ML training + match recap
- `POST /bots/:id/train/purchase` — `{tactic_key:"italian_game"}`
- `POST /bots/:id/train/drill` — `{tactic_key:"italian_game"}`
- `GET /bots/:id/training-log`
- `POST /bots/:id/level-test` — runs 3-5 games, returns pass/fail + details
- `GET /bots/:id/level-tests` — all test history
- `POST /bots/:id/play/new` — `{player_color:"w"}` -> session with bot's first move if black
- `POST /bots/:id/play/:sessionId/move` — `{move:"e4"}` (SAN) -> bot reply
- `POST /bots/:id/play/:sessionId/resign` — no body needed (don't set Content-Type)

## Database

SQLite with Drizzle ORM. 7 tables: `players`, `bots`, `bot_tactics`, `training_log`, `game_records`, `level_tests`, `play_sessions`. Schema in `server/src/db/schema.ts`.

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
| `JWT_SECRET` | dev-secret | Change in production |
| `STOCKFISH_POOL_SIZE` | cpus-2 | Stockfish worker count |
| `STOCKFISH_TIMEOUT_MS` | 30000 | Per-request timeout |
| `ML_MODEL_CACHE_SIZE` | 50 | LRU cache for loaded models |
| `MAX_CONCURRENT_SPARS` | 8 | Concurrency limiter |
| `MAX_CONCURRENT_LEVEL_TESTS` | 4 | Concurrency limiter |

## Testing

```bash
cd server
npm test              # 581 tests (unit + integration)
npx vitest run        # Run once
npx vitest            # Watch mode
```

Tests use `DB_PATH=":memory:"` and a 2-worker Stockfish pool. The E2E test (`e2e-flow.test.ts`) exercises the full journey: register -> create bot -> spar -> purchase tactic -> drill -> leaderboard. Has a 2-minute timeout for Stockfish games.

## Known Design Decisions

- **chess.js is NOT modified** — it's the upstream fork, all game logic goes in `server/`
- **Stockfish uses child_process.fork**, not worker_threads, for WASM compatibility
- **ML model per bot** — each bot has its own TensorFlow.js Sequential model stored as a JSON blob
- **Rate limiting is in-memory** — resets on server restart, fine for single-instance
- **Opening books are FEN-indexed** — the FEN prefix (first 4 parts) is used as lookup key
- **Resign endpoint** doesn't accept a body — don't send Content-Type: application/json

## What's Next (potential improvements)

- Frontend (React/Next.js or mobile)
- WebSocket for real-time play instead of request-response
- PostgreSQL migration for multi-instance deployment
- Redis for distributed rate limiting and session storage
- Bot-vs-bot matchmaking between player bots
- More opening books and tactical puzzles
- Replay viewer with move-by-move commentary
