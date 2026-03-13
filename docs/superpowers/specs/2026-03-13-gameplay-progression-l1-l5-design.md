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

**What happens:**
1. Player clicks the "Train" button
2. Bot plays a compressed game vs a practice opponent (resolved server-side)
3. Player sees a ~3-5 second result sequence:
   - Small board shows 3-4 key position snapshots (opening, critical moment, final position)
   - Result card slides in: Win (green), Loss (red), or Draw (yellow)
   - XP gained, elo change, and energy earned are displayed
4. Dashboard updates: XP bar ticks, energy orb fills, elo number shifts

**Rewards (every spar):**
- Small XP gain (scaled to level)
- Elo change (standard elo calculation vs opponent strength)
- +1 Energy (the fuel for card plays)

**Loot Table (variable bonus per spar):**

| Drop | Chance | Effect |
|------|--------|--------|
| Nothing extra | ~50% | Standard rewards only |
| Insight | ~20% | Reveals a bot weakness: "Your bot struggled with knight forks" |
| Bonus Energy | ~15% | +1 extra energy (2 total this spar). Win streaks increase this chance. |
| Card Drop | ~10% | A random card is added to the player's hand (can exceed hand size of 7) |
| Boss Intel | ~5% | Free scouting info about the current ladder opponent |

**Win Streaks:**
- 3+ consecutive wins trigger "Hot Streak" with fire particles and +2 bonus energy
- Streaks reset on loss
- Create a natural excitement arc during the grind phase

**Bot Reactions:**
- Terrarium bot reacts to each spar result with varied mood expressions
- 8-10 different messages per outcome type prevent repetition
- Examples: "Let's go!", "That was close...", "I'm learning!", "Not my best game."

**Elo Milestones:**
- Every 50 elo gained triggers a small celebration: "Elo milestone: 450!"
- Natural pacing: occurs roughly every ~8 spars

**Context Cues:**
- As the player approaches enough energy for a card play: "Energy charged! Time for a card play?"
- As training progresses toward boss-readiness: "Almost ready for Knight Hopper..."

### Card Plays (Strategic Training)

Cards are always available in the player's hand (draw 7 anytime). Playing a card costs Energy, which is earned from Quick Spars.

**Card economy:**
- Energy is earned at 1 per spar (plus occasional bonuses)
- Cards cost 0-3 energy depending on power
- ~20-25 spars per level = ~20-25 base energy per level
- Player makes ~5-7 card plays per level

**What cards provide that spars cannot:**
- Learning new tactics (Study card) - the ONLY way to acquire tactics
- Drilling tactic proficiency (Drill/Deep Drill)
- Scouting boss weaknesses (Scout card)
- Extra energy generation (Focus card)
- Massive XP bursts (Power Spar)
- Hand refresh (Rest card)
- Self-testing by playing your own bot (Challenge card)

**Card types and unlock schedule:**

| Card | Energy | Effect | Unlocked at |
|------|--------|--------|-------------|
| Spar | 2 | Fight a system bot with full ML training. Better rewards than Quick Spar. | Level 1 |
| Focus | 0 | +1 energy this round. Free card that extends your turn. | Level 1 |
| Rest | 0 | Discard hand, draw 7 new cards. | Level 1 |
| Drill | 1 | Practice an owned tactic (+15 proficiency). | Level 2 |
| Study | 3 | Purchase a tactic from the shop. | Level 3 |
| Scout | 1 | Preview next ladder opponent's strengths and weaknesses. | Level 3 |
| Power Spar | 3 | Spar with 2x XP reward. | Level 4 |
| Deep Drill | 2 | Drill with +30 proficiency instead of +15. | Level 4 |
| Challenge | 0 | Play vs your own bot (free, opens board). | Level 5 |
| Analyze | 1 | Peek at bot brain (ML insights). | Level 5 |

**Card hand management:**
- Player draws 7 cards from the full pool of available card types
- Cards that haven't been unlocked yet don't appear in draws
- Card drops from spars can push hand above 7
- "New Round" button discards current hand and draws 7 fresh cards (no cost)
- Hand refreshes automatically on level-up

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
- Unlimited retries (spam doesn't help because the bot hasn't improved)
- Boss fights use the same engine as spars but with fixed opponent configurations

### Boss Fight UX

Boss fights differ from Quick Spars:
- Longer display: ~10-15 seconds with key moments highlighted
- Full board shows critical moments with commentary
- Commentary explains what happened: "Your bot fell for a bishop pin on move 8"
- More dramatic animations and effects

### What Losing a Boss Fight Gives

Losses are productive, not punishing:
1. **Specific insight** (always): "Your bot's endgame elo is 350 vs opening elo of 520"
2. **Bonus energy** (+3): Enough to play a card immediately
3. **Suggested card play**: "Try using a Drill card on 'Pin Defense'" - directs the player's next action

This creates a **lose -> learn -> train -> retry** loop that feels like progress.

### The Championship Bout

Unlocks after all 3 ladder opponents are defeated. This is a **dramatized best-of-3**:

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

**Lose = "Almost!"** Ladder resets. Player keeps all training progress. Must re-climb the 3 opponents (should be easy since they beat them before) and retry the championship.

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

## Energy Economy Per Level

Typical flow within a single level:

```
Start: 0 energy
Spar x5         -> 5 energy (+maybe 1 loot bonus)
Play Drill (1)  -> 4 energy remaining
Spar x4         -> 8 energy
Play Study (3)  -> 5 energy remaining
Spar x3         -> 8 energy
Play Scout (1)  -> 7 energy remaining
Boss attempt    -> Lose -> +3 bonus energy -> 10 energy
Play Deep Drill -> 8 energy remaining
Spar x3         -> 11 energy
Boss retry      -> Win! Proceed to next ladder opponent.
... continue until championship ...
Championship    -> Level up! Energy resets, new cards unlock.
```

Total per level: ~20-25 spars, ~5-7 card plays, 1-3 boss attempts.

---

## Screen Layout

```
+----------------------------------------------------------+
| Energy: 7/10    Round 3    Elo: 485    Level 2           |
+---------------+------------------------------------------+
| TERRARIUM     |                                          |
|               |  [BOSS LADDER]                           |
| +----------+  |  Championship (locked)                   |
| |  (o  o)  |  |  Gatekeeper (defeated)                  |
| |   \_/    |  |  > Rival (CURRENT)                      |
| +----------+  |  Warm-up (defeated)                      |
|               |                                          |
| Lv.2 Elo:485 |  [ACTIVITY LOG]                          |
| XP: ####--   |  Win! +12 XP, +1 energy                  |
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
+----------------------------------------------------------+
```

The Quick Spar button is always prominent and accessible. Card hand sits alongside it. The player naturally alternates between the two.

---

## Changes Required to Existing System

### Server Changes

1. **New endpoint: `POST /bots/:id/quick-spar`**
   - Runs a fast spar against a random opponent at or slightly below bot's level
   - Returns: game result, XP gained, elo change, energy earned, loot roll result
   - Does NOT consume training points (free action)
   - Still runs ML training on the game (bot genuinely improves)
   - Opponent is a system bot, not a ladder opponent

2. **Modify card unlock system**
   - Cards have an `unlockedAtLevel` field
   - `drawHand()` filters the card pool to only include unlocked cards
   - New cards appear in the hand automatically after level-up

3. **Modify energy system**
   - Energy is no longer tied to training points
   - Energy earned from quick spars (1 per spar + loot bonuses)
   - Energy resets to 0 on level-up (fresh start each level)
   - Boss fight losses grant +3 bonus energy

4. **Loot table system**
   - New service: `LootService` that rolls the loot table after each spar
   - Returns: insight text, bonus energy amount, card drop (if any), boss intel (if any)
   - Probabilities configurable per level

5. **Boss fight feedback**
   - When a ladder spar results in a loss, analyze the game for the key moment
   - Return: weakness description, suggested card play, bonus energy grant

6. **Win streak tracking**
   - Track consecutive wins in the card_hands table or a new field
   - 3+ wins = streak bonus energy
   - Reset on loss

7. **Card unlock gating**
   - Add `unlocked_at_level` field to card definitions
   - Filter card pool during hand draws based on bot level

8. **Boss gimmick configuration**
   - Extend system-bots.json with gimmick metadata per boss
   - Include: weakness description, scout text, play style hint
   - Used by Scout card and loss feedback

### Frontend Changes

1. **Quick Spar button and result display**
   - Prominent "Train" button in the main area
   - Result animation: board snapshots -> result card -> loot display
   - Dashboard pulse on update (XP bar, energy, elo)

2. **Card unlock animations**
   - On level-up, new card types appear with a "NEW!" badge
   - First draw with new cards highlights them

3. **Boss fight enhanced display**
   - Longer, more dramatic game replay for boss fights
   - Commentary overlay for key moments
   - Loss feedback panel with suggested next action

4. **Championship bout sequence**
   - Multi-round display with narrative titles
   - Between-round bot reactions
   - Escalating visual intensity across rounds

5. **Win streak display**
   - Streak counter near the Quick Spar button
   - Fire particles on 3+ streak
   - Streak break shows "Streak ended at 5"

6. **Elo milestone celebrations**
   - Small popup on every 50 elo gained
   - Brief particle effect

---

## Out of Scope

- PvP matchmaking (post-Level 5 feature, separate spec)
- Levels 6-20 progression
- Monetization / premium cards
- Mobile-specific UI
- Sound effects and music
- Real-time multiplayer
