# ChessMon Gameplay Progression Design: Level 1-5

## Overview

Design for the training-phase gameplay loop that takes a player from creating a fresh bot (Level 1) to PvP-ready (Level 5 graduation) in a single ~35-minute session. After Level 5, bots enter a PvP arena to compete against other human-created bots (PvP is out of scope for this spec).

## Core Design Principles

1. **Two-speed training**: Free Quick Spars are the grind; Cards are the strategy layer
2. **Real skill gating**: Boss fights test actual bot chess strength, not resource accumulation
3. **Variable rewards**: Every click *might* be special (loot drops, streaks, insights)
4. **Emotional attachment**: The terrarium bot reacts, celebrates, and struggles alongside the player
5. **30-45 minute arcade session**: Fast enough to finish in one sitting, deep enough to feel meaningful

---

## The Two Player Actions

### Quick Spar (Free Training)

The player's primary action. Always available, no cost.

**Opponent selection:** Quick Spar opponent is `max(1, bot.level - 1)` system bot. This keeps spars winnable while still challenging. The opponent is always a system bot from `system-bots.json`, never a ladder opponent.

**Latency strategy:** A full Stockfish game at depth 3-5 takes 5-30 seconds. To meet the ~3-5 second UX target, the Quick Spar endpoint starts the game and returns immediately with a loading state. The frontend shows a brief "training..." animation (~2 sec), then polls or receives the result. If the game finishes faster than 2 seconds (common at depth 3), the result appears immediately after the animation. If slower, the animation extends with a progress indicator. The compressed "key moments" display runs after the result arrives, not during computation.

**What happens:**
1. Player clicks the "Train" button
2. Server starts a game (async). Frontend shows a brief training animation.
3. Result arrives. Player sees a ~3-5 second result sequence:
   - Small board shows 3-4 key position snapshots (opening, critical moment, final position). Key moments are positions where eval swings > 1.5 pawns, using the existing `generateMatchRecap()` from `battle-commentary.ts`.
   - Result card slides in: Win (green), Loss (red), or Draw (yellow)
   - XP gained, elo change, and energy earned are displayed
4. Dashboard updates: XP bar ticks, energy orb fills, elo number shifts

**XP rewards:**

| Level | Quick Spar XP (win) | Quick Spar XP (loss) | Card Spar XP (win) | Card Spar XP (loss) |
|-------|---------------------|----------------------|---------------------|----------------------|
| 1 | 15 | 5 | 30 | 10 |
| 2 | 18 | 6 | 36 | 12 |
| 3 | 20 | 7 | 40 | 14 |
| 4 | 22 | 8 | 44 | 16 |
| 5 | 25 | 9 | 50 | 18 |

Card Spar gives 2x the XP of Quick Spar. Power Spar gives 4x (2x Card Spar). Draw XP is midpoint between win and loss.

**Other rewards (every spar):**
- Elo change (standard elo calculation vs opponent strength)
- +1 Energy (the fuel for card plays)

**Loot Table (variable bonus per spar):**

Loot categories are **mutually exclusive** — one roll determines which bonus (if any) occurs. Exact percentages:

| Drop | Chance | Effect |
|------|--------|--------|
| Nothing extra | 50% | Standard rewards only |
| Insight | 20% | Reveals a bot weakness (random from a curated list per level, e.g., "Your bot struggled with knight forks", "Endgame play needs work") |
| Bonus Energy | 15% | +1 extra energy (2 total this spar). |
| Card Drop | 10% | A random card (from unlocked card types only) is added to the player's hand. Hand can grow to max 10 cards; drops are skipped if hand is already at 10. |
| Boss Intel | 5% | Free scouting info about the current ladder opponent. Same data format as the Scout card result. If no ladder opponent exists (all defeated), re-rolls as Bonus Energy. |

**Win Streaks:**
- 3+ consecutive Quick Spar wins trigger "Hot Streak" with fire particles and +2 bonus energy (granted in addition to the loot roll, not replacing it)
- Streaks only track Quick Spar results. Boss fights do NOT affect the streak counter (boss losses should feel productive, not streak-breaking).
- Streaks reset on Quick Spar loss
- Create a natural excitement arc during the grind phase

**Bot Reactions:**
- Terrarium bot reacts to each spar result with varied mood expressions
- 8-10 different messages per outcome type prevent repetition
- Examples: "Let's go!", "That was close...", "I'm learning!", "Not my best game."

**Elo Milestones:**
- Every 50 elo gained triggers a small celebration: "Elo milestone: 450!"
- Natural pacing: occurs roughly every ~8 spars

**Context Cues:**
- Trigger: when energy transitions from "insufficient for any card in hand" to "sufficient for at least one card": "Energy charged! Time for a card play?"
- Trigger: when bot elo reaches within 80% of the next ladder opponent's elo: "Almost ready for Knight Hopper..."
- Maximum one context cue per spar result to avoid spam.

### Card Plays (Strategic Training)

Cards are always available in the player's hand (draw 7 anytime). Playing a card costs Energy, which is earned from Quick Spars.

**Card economy:**
- Energy is earned at 1 per spar (plus occasional bonuses from loot and streaks)
- Cards cost 0-3 energy depending on power
- ~20-25 spars per level = ~25-35 total energy per level (including streak bonuses and loot)
- Player makes ~8-12 card plays per level (mix of free and energy-costing cards)

**What cards provide that spars cannot:**
- Learning new tactics (Study card) - the ONLY way to acquire tactics
- Drilling tactic proficiency (Drill/Deep Drill)
- Scouting boss weaknesses (Scout card)
- Extra energy generation (Focus card)
- Massive XP bursts (Power Spar — 4x Quick Spar XP)
- Hand refresh (Rest card)
- Self-testing by playing your own bot (Challenge card)

**Card Spar vs Quick Spar — the key difference:**
Card Spar (2 energy) gives **2x XP**, runs ML training with more weight, and counts as a "real" training session (appears in training log). Quick Spar (free) gives half XP and lighter ML training. The Card Spar is the "serious workout" while Quick Spar is "jogging."

**Card types and unlock schedule:**

| Card | Energy | Effect | Unlocked at |
|------|--------|--------|-------------|
| Spar | 2 | Fight a system bot. 2x XP vs Quick Spar, heavier ML training. | Level 1 |
| Focus | 0 | +1 energy this round. Free card that extends your turn. | Level 1 |
| Rest | 0 | Discard hand, draw 7 new cards. Useful when hand has no useful cards. | Level 1 |
| Drill | 1 | Practice an owned tactic (+15 proficiency). | Level 2 |
| Study | 3 | Purchase a tactic from the shop (opens tactic picker). | Level 3 |
| Scout | 1 | Preview next ladder opponent's strengths and weaknesses. | Level 3 |
| Power Spar | 3 | Spar with 4x XP reward (2x Card Spar). | Level 4 |
| Deep Drill | 2 | Drill with +30 proficiency instead of +15. | Level 4 |
| Challenge | 0 | Play vs your own bot (free, opens board). | Level 5 |
| Analyze | 1 | Peek at bot brain (ML insights). | Level 5 |

**Card hand management:**
- Player draws 7 cards from the pool of card types unlocked at their current level
- Card drops from spars can push hand up to max 10 cards
- Rest card discards current hand and draws 7 fresh cards (0 energy cost). The "New Round" button on the UI is simply a convenience that plays the Rest card effect without needing one in hand. It's always available.
- Hand refreshes automatically on level-up (old cards discarded, new 7 drawn from expanded pool)

**Relationship to existing training points:** The existing `trainingPointsRemaining` system is **replaced** by the energy system for levels 1-5. The old `POST /bots/:id/train/spar`, `train/drill`, and `train/purchase` endpoints remain functional but are called internally by the card system rather than directly by the player. Training points still exist in the database but are not displayed or consumed directly — energy is the player-facing resource.

---

## Energy System Details

**Energy persistence:** Energy is stored in the `card_hands` table and persists across browser sessions. If a player closes the browser and returns, their energy and hand are preserved.

**Energy cap:** No hard cap. Energy can accumulate freely. Typical levels generate 25-35 energy, and most is spent on cards, so accumulation beyond ~15 is unusual. The Focus card and streak bonuses can push it higher, which is fine — it rewards good play.

**Energy on level-up:** Resets to 0. The player starts each level fresh. This prevents hoarding energy from easy early levels.

**Energy on boss loss:** +3 bonus energy granted immediately. This is enough to play a Drill (1), Scout (1), or Focus (0) + Drill combo, directing the player toward improvement.

---

## Boss Fight System

### The Ladder (Per Level)

Each level has a 3-opponent ladder plus a championship bout:

```
Championship Bout (locked until all 3 defeated)
    ^
Gatekeeper (at target level elo)
    ^
Rival (at current level elo)
    ^
Warm-up (below current level, confidence builder)
```

### Boss Fight Rules

- Boss fights are **free** - no energy cost
- The gate is the bot's actual chess skill, not resources
- Unlimited retries, but with a **5-second cooldown** between attempts to prevent spam (server enforces via rate limiter category)
- Boss fights use the same engine as spars but with fixed opponent configurations from `system-bots.json`

### Boss Fight UX

Boss fights differ from Quick Spars:
- Longer display: ~10-15 seconds with key moments highlighted
- Full board shows critical moments with commentary (using `generateMatchRecap()` key moments where eval swings > 1.5 pawns)
- Commentary explains what happened: "Your bot fell for a bishop pin on move 8"
- More dramatic animations and effects

### What Losing a Boss Fight Gives

Losses are productive, not punishing:
1. **Specific insight** (always): Generated from game analysis — "Your bot's endgame collapsed after move 28" or "Lost material to a knight fork on move 12"
2. **Bonus energy** (+3): Enough to play a card immediately
3. **Suggested card play**: Based on the weakness identified — "Try using a Drill card on 'Pin Defense'" — directs the player's next action

This creates a **lose -> learn -> train -> retry** loop that feels like progress.

### The Championship Bout

Unlocks after all 3 ladder opponents are defeated. This is a **dramatized best-of-3**.

**Server-side state:** Championship bout state is tracked in a new `championship_bouts` table:
```
championship_bouts: {
  id, botId, targetLevel, gamesPlayed, gamesWon,
  currentRound (1-3), status ('active'|'won'|'lost'),
  gameRecordIds (JSON array), createdAt
}
```

The championship uses the existing `POST /bots/:id/level-test`-style logic but adapted for a sequential best-of-3 format:
- `POST /bots/:id/championship/start` — creates a new championship bout, returns round 1 opponent info
- `POST /bots/:id/championship/play-round` — plays the next round, returns game result + narrative
- The server determines after each round whether the bout is decided (2 wins or 2 losses) or continues

**If the player closes the browser mid-championship:** The bout persists in DB. On return, the dashboard shows "Championship in progress — Round 2" and the player can resume.

**Round 1 - "The Opening"**
- Full-screen board. Dramatic title card.
- Game plays at medium speed (~15 sec). Key moments pause with commentary.
- Win: "Your bot draws first blood!" - bot celebrates in terrarium
- Lose: "The [Boss] takes the lead." - bot looks worried, tension meter rises

**Round 2 - "The Counter"**
- If leading 1-0: "The [Boss] adapts its strategy..."
- If trailing 0-1: "Your bot digs deep..."
- Higher tension. More urgent commentary. Intensified particles.

**Round 3 (if needed) - "The Decider"**
- Maximum drama. Slowest game speed. Every critical move pauses.
- "Everything comes down to this." Terrarium pulses. Energy bar glows.
- Checkmate triggers a massive splash screen with confetti.

**Between rounds:** Bot mood shifts. Quick stat line shows tactical moments.

**Win = Level up** with big splash, visual evolution, new cards unlocked, hand refresh.

**Lose = "Almost!"** Ladder resets (existing `resetLadder()` deletes all `ladder_progress` rows for the bot and re-initializes). Player keeps all training progress (XP, elo, tactics, ML weights). They must re-climb the 3 opponents (should be easy since they beat them before) and retry the championship.

---

## Level-by-Level Progression

### Level 1: "First Steps" (~5 min)

- **Cards available:** Spar, Focus, Rest
- **Goal:** Learn the loop. Click spar, see bot play, earn energy, play a card.
- **Ladder opponents:** Pawn Pusher -> Pawn Pusher -> Knight Hopper
- **Boss - "Pawn Pusher":** Plays only pawn moves for the first 5 moves. Extremely predictable. Teaches what a boss fight looks like.
- **Boss gimmick:** None. Just "can your bot play chess at all?"
- **Level-up reward:** Small visual glow on bot. Drill card unlocks.

### Level 2: "Finding Focus" (~7 min)

- **New card:** Drill
- **Goal:** Learn that cards do things spars can't. Drilling a tactic makes your bot noticeably better.
- **Ladder opponents:** Knight Hopper -> Knight Hopper -> Bishop Sniper
- **Boss - "Knight Hopper":** Aggressively develops knights, loves forks.
- **Boss gimmick:** Weak to bots with high positional training. Hint: "This opponent loves surprise knight attacks..."
- **Level-up reward:** Aura appears on bot. Study + Scout cards unlock.

### Level 3: "Opening Moves" (~7 min)

- **New cards:** Study + Scout
- **Goal:** Study lets you learn new tactics. Scout previews the boss. Real strategic choices begin.
- **Ladder opponents:** Bishop Sniper -> Bishop Sniper -> Rook Roller
- **Boss - "Bishop Sniper":** Strong diagonal play, uses pins and skewers.
- **Boss gimmick:** Always opens with aggressive bishop development. Weak to bots who know solid openings. Scout reveals: "This opponent pins pieces to your king."
- **Level-up reward:** Art evolution. Power Spar + Deep Drill unlock.

### Level 4: "Preparation" (~8 min)

- **New cards:** Power Spar + Deep Drill
- **Goal:** Power cards are expensive but powerful. Deep Drill gives +30 instead of +15. Efficiency tradeoffs emerge.
- **Ladder opponents:** Rook Roller -> Rook Roller -> The Scholar
- **Boss - "Rook Roller":** Strong endgame, converts small advantages into wins.
- **Boss gimmick:** Plays conservatively, trades down to endgames, then crushes. Weak to aggressive openings. Scout reveals: "This opponent wants a long game."
- **Level-up reward:** Stronger aura. Full deck + Challenge card unlock.

### Level 5: "Graduation" (~8 min)

- **New cards:** Challenge + Analyze (full deck)
- **Goal:** Challenge card lets you test against your own bot. Final preparation for PvP.
- **Ladder opponents:** The Scholar -> The Scholar -> The Grandmaster
- **Boss - "The Scholar":** Well-rounded, no obvious weakness. Adapts strategy mid-game.
- **Boss gimmick:** If your bot plays aggressively, The Scholar plays defensively (and vice versa). Hint: "This opponent studies YOU." Only a well-rounded bot can win.
- **Championship - "The Grandmaster":** The final boss. Best-of-3 with maximum drama.
- **Graduation reward:** Big splash screen. "Your bot is ready for the arena!" Pixel art final form. PvP queue unlocks (future feature).

---

## Energy Economy Per Level (Level 3 Example)

Typical flow within a single level at Level 3 (Study + Scout unlocked):

```
Start: 0 energy
Quick Spar x5      -> 5 energy (+1 loot bonus = 6)
Play Drill (1)     -> 5 energy remaining
Quick Spar x3      -> 8 energy (+streak bonus possible)
Play Study (3)     -> 5 energy remaining        [Learn Italian Game!]
Quick Spar x3      -> 8 energy
Play Scout (1)     -> 7 energy remaining        [Boss uses pins...]
Play Drill (1)     -> 6 energy remaining        [Drill pin defense]
Quick Spar x2      -> 8 energy
Boss attempt       -> Lose -> +3 bonus energy   -> 11 energy
Play Drill (1)     -> 10 energy remaining       [Drill what boss exposed]
Quick Spar x2      -> 12 energy
Boss retry         -> Win! Next ladder opponent.
Quick Spar x3      -> 15 energy (carrying surplus into next boss)
Play Card Spar (2) -> 13 energy                 [2x XP boost]
Boss #2            -> Win!
Quick Spar x4      -> 17 energy
Boss #3 (Gatekeeper) -> Win!
Championship       -> Best-of-3 -> Level up! Energy resets to 0.
```

Total: ~25 Quick Spars, ~8 card plays, 1-3 boss attempts. ~7 minutes elapsed.

---

## Screen Layout

```
+----------------------------------------------------------+
| Energy: 7    Streak: 4x    Elo: 485    Level 2           |
+---------------+------------------------------------------+
| TERRARIUM     |                                          |
|               |  [BOSS LADDER]                           |
| +----------+  |  Championship (locked)                   |
| |  (o  o)  |  |  Gatekeeper (defeated)                  |
| |   \_/    |  |  > Rival (CURRENT)                      |
| +----------+  |  Warm-up (defeated)                      |
|               |                                          |
| Lv.2 Elo:485 |  [ACTIVITY LOG]                          |
| XP: ####--   |  Win! +18 XP, +1 energy                  |
|               |  Card Drop! Found: Drill                 |
| Mood: "Let's |  Loss vs Knight Hopper. Weak endgame.    |
|  go!"        |  Drilled Italian Game (+15 prof)          |
|               |                                          |
| ATK ####-    |                                          |
| POS ##---    |                                          |
| TAC ###--    |                                          |
+---------------+------------------------------------------+
| [QUICK SPAR]         [YOUR HAND - 5 cards]              |
|                 Spar  Drill  Focus  Spar  Rest           |
| > Click to      (2)   (1)    (0)   (2)   (0)           |
|   train!                                                 |
|               [New Round]                                |
+----------------------------------------------------------+
```

The Quick Spar button is always prominent and accessible. Card hand sits alongside it. The "New Round" button is smaller, below the hand — used when the current hand has no useful plays.

---

## Changes Required to Existing System

### Server Changes

1. **New endpoint: `POST /bots/:id/quick-spar`** (server)
   - Opponent: `max(1, bot.level - 1)` system bot
   - Runs `simulateGame()` + `trainBotFromGame()` (same as existing spar, lighter ML training weight: 0.5x epochs)
   - Does NOT consume training points
   - Returns: `{ result, xpGained, eloChange, energyEarned, loot: { type, data }, keyMoments[], streak }`
   - Rate limit: 1 request per second per bot (prevents rapid-fire clicking)

2. **New endpoint: `POST /bots/:id/championship/start`** (server)
   - Creates a `championship_bouts` row
   - Returns: round info, opponent details

3. **New endpoint: `POST /bots/:id/championship/play-round`** (server)
   - Plays one round of the championship
   - Returns: game result, narrative text, bout state (rounds played, wins, status)
   - If bout is decided (2 wins or 2 losses), triggers level-up or ladder reset

4. **New table: `championship_bouts`** (server)
   - `id, botId, targetLevel, gamesPlayed, gamesWon, status, gameRecordIdsJson, createdAt`

5. **New service: `LootService`** (server)
   - `rollLoot(botId, isWin, streakCount)` -> `{ type: 'none'|'insight'|'energy'|'card'|'intel', data }`
   - Probabilities: hardcoded in service (50/20/15/10/5), configurable later
   - Insights: curated list per level in a new `data/insights.json`
   - Boss Intel: same format as Scout card result, pulled from `system-bots.json` gimmick metadata

6. **Modify `CardService`** (server)
   - Add `unlockedAtLevel` to card definitions in `cards.json`
   - `randomDraw(count, botLevel)` — filters pool by `unlockedAtLevel <= botLevel`
   - `addEnergy(botId, amount)` — new method for spar energy grants
   - Energy starts at 0 on new hands (not `maxEnergy`)
   - Remove `maxEnergy` from hand state or repurpose as display-only

7. **Modify `LadderService`** (server)
   - Add boss gimmick metadata to `system-bots.json`: `{ weakness, scoutText, playStyleHint }`
   - `getScoutInfo(botId)` — returns the current ladder opponent's gimmick data
   - `getBossLossAdvice(botId, gameRecord)` — analyzes loss and returns training suggestion

8. **Win streak tracking** (server)
   - Add `win_streak INTEGER NOT NULL DEFAULT 0` column to `card_hands` table
   - Updated by Quick Spar endpoint (increment on win, reset on loss)
   - Streak bonus: +2 energy when streak >= 3

9. **Deprecate direct training point consumption** (server)
   - Old endpoints (`train/spar`, `train/drill`, `train/purchase`) remain but are called internally by card system
   - `trainingPointsRemaining` field still exists but is not decremented or displayed for L1-5 gameplay
   - No breaking changes to existing tests

### Frontend Changes

1. **Quick Spar button and result display** (frontend)
   - Prominent "Train" button in the main area (right column, above card hand)
   - Click -> brief training animation (2 sec) -> result card with board snapshots
   - Dashboard pulses on update (XP bar fill, energy increment, elo shift)
   - Loot drop appears as sparkle overlay on the result card

2. **Card unlock animations** (frontend)
   - On level-up, new card types appear with a "NEW!" badge and glow
   - First draw with new cards highlights them with a different border color

3. **Boss fight enhanced display** (frontend)
   - Longer, more dramatic game replay for boss fights
   - Commentary overlay for key moments (eval swing > 1.5 pawns from `generateMatchRecap()`)
   - Loss feedback panel: shows weakness, suggested card, +3 energy animation

4. **Championship bout sequence** (frontend)
   - Multi-round display with narrative titles ("The Opening", "The Counter", "The Decider")
   - Between-round bot reactions in terrarium
   - Escalating visual intensity (particles, glow, speed) across rounds
   - Resume support: detect active championship on dashboard load

5. **Win streak display** (frontend)
   - Streak counter near the Quick Spar button: "Streak: 4x" with fire emoji at 3+
   - Fire particles on streak threshold
   - Streak break: brief "Streak ended at 5" message

6. **Elo milestone celebrations** (frontend)
   - Small popup on every 50 elo gained
   - Brief particle effect and terrarium reaction

7. **"New Round" button** (frontend)
   - Small button below the card hand
   - Discards current hand and draws 7 new cards
   - Always available as an escape valve when hand has no useful plays

---

## Out of Scope

- PvP matchmaking (post-Level 5 feature, separate spec)
- Levels 6-20 progression
- Monetization / premium cards
- Mobile-specific UI
- Sound effects and music
- Real-time multiplayer
