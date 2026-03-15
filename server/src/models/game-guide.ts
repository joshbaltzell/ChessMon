/**
 * ChessMon Game Guide — structured mechanics explanations for players.
 */

export function getGameGuide() {
  return {
    overview: {
      title: 'Welcome to ChessMon!',
      description: 'Train chess bots with unique personalities, teach them openings and tactics, then test their skills in level challenges. Like raising a Pokemon — but for chess.',
      flow: [
        'Create a bot with a name, attribute distribution, and alignment',
        'Train your bot by sparring against system bots or other players',
        'Purchase and drill tactics/openings to expand your bot\'s repertoire',
        'Take the level test when ready — beat opponents to level up',
        'Climb from level 1 (400 elo) to level 20 (2400 elo)',
      ],
    },

    attributes: {
      title: 'Attributes (50 total points)',
      description: 'Each bot gets 50 points to distribute across 5 stats. Focused builds (15-20 in one stat) get bonus effects, so specialization beats generalization.',
      stats: [
        {
          name: 'Aggression',
          range: '0-20',
          effect: 'Makes your bot prefer captures, checks, and forcing moves. At 15+, gains a focus bonus and weighs tactical opportunities higher.',
          playstyle: 'Aggressive bots win by overwhelming opponents with initiative. They struggle against solid positional players.',
        },
        {
          name: 'Positional',
          range: '0-20',
          effect: 'Trusts the engine\'s best moves, avoids risky play. At 15+, gains +1 search depth AND halves blunder rate.',
          playstyle: 'Positional bots play the objectively strongest moves. They\'re the most consistently strong, but predictable.',
        },
        {
          name: 'Tactical',
          range: '0-20',
          effect: 'Finds combinations and sharp play. At 15+, blunder rate drops by 40%. At 18+, gains +1 search depth for finding deep tactics.',
          playstyle: 'Tactical bots calculate deeply. They win by finding moves others miss.',
        },
        {
          name: 'Endgame',
          range: '0-20',
          effect: 'Dominates when material is low (<=24 material points). The endgame weight multiplier is 4x higher in endgame positions.',
          playstyle: 'Endgame bots steer toward simplified positions where precision wins. They\'re hard to beat in long games.',
        },
        {
          name: 'Creativity',
          range: '0-20',
          effect: 'Controls move selection temperature. High creativity = more variety in move choices. Low creativity = always picks the top-scored move.',
          playstyle: 'Creative bots are unpredictable. Opponents can\'t prepare for them, but they occasionally play suboptimal moves. The ML model learns faster from diverse training data.',
        },
      ],
      tips: [
        'A "10/10/10/10/10" build is viable but won\'t excel anywhere',
        'Try "18/5/17/5/5" for a pure aggressive-tactical attacker',
        'Try "3/18/3/18/8" for a solid positional endgame grinder',
        'The focus bonus at 15+ makes a huge difference — go big or go home',
      ],
    },

    alignments: {
      title: 'Alignments (Attack + Style)',
      description: 'Each bot picks one Attack alignment and one Style alignment. These add small bonuses and shape personality.',
      attack: [
        {
          name: 'Aggressive',
          effect: '+0.15 aggression weight',
          personality: 'Bold, loud, confident. Gets furious on losses.',
        },
        {
          name: 'Balanced',
          effect: 'No modifier — pure flexibility',
          personality: 'Adaptable, calm, versatile. Takes losses gracefully.',
        },
        {
          name: 'Defensive',
          effect: '+0.15 endgame weight, -20% blunder rate',
          personality: 'Patient, stoic, fortress-minded. Grinds opponents down.',
        },
      ],
      style: [
        {
          name: 'Chaotic',
          effect: '+0.2 temperature (more unpredictable)',
          personality: 'Wild, playful, mischievous. Loves surprises.',
        },
        {
          name: 'Positional',
          effect: '+0.15 positional weight',
          personality: 'Scholarly, methodical, precise. Respects the classics.',
        },
        {
          name: 'Sacrificial',
          effect: '+0.1 aggression weight, +0.1 tactical weight',
          personality: 'Dramatic, bold, willing to give material for glory.',
        },
      ],
    },

    training: {
      title: 'Training System',
      description: 'Train your bot through quick spars, tactic purchases, and drilling. Each spar earns XP and teaches your bot\'s ML model.',
      actions: [
        {
          name: 'Quick Spar',
          description: 'Free timed spar on a 5-minute cooldown. Win streaks of 3+ reduce the timer. Earns XP, energy, and a chance at loot (insights, cards, boss intel).',
        },
        {
          name: 'Purchase Tactic',
          description: 'Buy a tactic or opening from the catalog. Opening tactics give your bot a "book" of known positions. Other tactics affect attribute bonuses.',
        },
        {
          name: 'Drill',
          description: 'Practice an owned tactic. Increases proficiency (starts at 20%, caps at 100%). Higher proficiency = more likely to follow the opening book correctly.',
        },
      ],
      strategy: [
        'Quick Spar early and often — the ML model needs games to learn from',
        'Win streaks reduce spar cooldown and improve loot chances',
        'Purchase openings that match your alignment (aggressive bots love the Sicilian)',
        'Drill before a boss fight — high proficiency opening play gives a real edge',
      ],
    },

    cardSystem: {
      title: 'Card System (Preparation + Powerups)',
      description: 'Cards are strategic pre-fight loadout, not an action menu. Draw a hand, spend energy to play cards, then fight.',
      categories: [
        {
          name: 'Preparation',
          description: 'Buffs applied to your next fight\'s PlayParameters.',
          examples: 'Sharpen (+2 depth), Iron Defense (-50% blunder rate), Tactical Focus (+0.4 tactical weight)',
        },
        {
          name: 'Powerup',
          description: 'One-shot triggers that activate during fights.',
          examples: 'Second Wind (+3 depth if losing at move 20+), Lucky Break (skip next blunder), Adrenaline (halve temperature for 10 moves)',
        },
        {
          name: 'Utility',
          description: 'Immediate non-combat effects.',
          examples: 'Focus (+1 energy), Rest (redraw hand), Scout (reveal boss weakness), Haste (reduce spar timer by 60s)',
        },
      ],
      tips: [
        'You draw 7 cards per hand. Play costs energy.',
        'Energy comes from level, Focus cards, loot, and quest rewards.',
        'Queue preparation buffs and powerups before boss fights for maximum effect.',
        'Scout cards reveal boss weaknesses — use them before championship bouts.',
        'Cards unlock at different levels (1-5 gating).',
      ],
    },

    sparTimer: {
      title: 'Spar Timer',
      description: 'Free spars run on a server-side cooldown to keep the engagement loop tight.',
      mechanics: [
        'Base cooldown: 5 minutes (300s)',
        'Win streaks of 3+ reduce timer by 30s per streak level',
        'Minimum cooldown floor: 2 minutes (120s)',
        'Haste prep card reduces next cooldown by 60s',
        'Dashboard shows a live countdown; button pulses when ready',
      ],
    },

    pilotMode: {
      title: 'Pilot Mode',
      description: 'Play AS your bot against a system opponent. Your moves teach the bot your style.',
      mechanics: [
        'You control your bot directly against a chosen system level',
        'Earns 1.5x XP compared to normal spars',
        'Elo changes are applied based on the system opponent\'s level',
        'After the game, the ML model trains on YOUR positions — teaching the bot your style',
        'Opening book suggestions appear as highlighted squares on the board',
        'Great for teaching your bot specific strategies you want it to learn',
      ],
    },

    bossesAndLadder: {
      title: 'Bosses & Ladder',
      description: 'Each level has a 3-opponent ladder of system bots leading to a championship bout.',
      mechanics: [
        'Defeat 3 ladder opponents sequentially to unlock the championship (boss fight)',
        'Each boss has a special ability that modifies their play (e.g. "Pawn Storm" +0.3 aggression, "Fortress" -50% blunder rate)',
        'Use the Scout card to reveal boss weakness and get counter-prep suggestions',
        'Championship bouts are multi-round — win enough rounds to advance',
        'Losing to a boss grants +3 energy and advice on countering their strategy',
      ],
    },

    dailyQuests: {
      title: 'Daily Quests & Streaks',
      description: 'Come back every day for quests and streak rewards.',
      mechanics: [
        '3 daily quests per bot, generated from a level-appropriate pool',
        'Quest types: win spars, play cards, earn XP, beat a boss, win streak, pilot win, and more',
        'Consecutive daily check-ins build a streak for bonus rewards:',
        '  Days 1-2: +2 energy',
        '  Days 3-5: +3 energy',
        '  Days 6+: +5 energy',
        'Your bot also fights autonomously while you\'re away (up to 8 fights per day)',
        'Return to see an overnight report with Elo changes and XP gains',
      ],
    },

    levelTests: {
      title: 'Level Tests (Legacy)',
      description: 'The ladder + championship system is the primary progression path. Level tests remain as an alternative.',
      mechanics: [
        'Play 3-5 games against opponents near the target elo',
        'Win a majority to pass and advance',
        'Failing grants +5 bonus training points',
        'The ladder/championship path is recommended for a better experience',
      ],
    },

    mlLearning: {
      title: 'How Your Bot Learns',
      description: 'Each bot has a neural network that learns your bot\'s playing style through training.',
      details: [
        'After each spar, the ML model trains on the game\'s positions',
        'Moves that contributed to wins get positive reinforcement',
        'Moves that led to losses get negative reinforcement',
        'The model influences 30% of move selection (engine evaluation is 70%)',
        'More games = better model. The first 10 spars have the biggest impact',
        'Creative bots generate more diverse training data, which can help the model generalize',
      ],
    },

    openingBooks: {
      title: 'Opening Books',
      description: 'Purchasable openings teach your bot specific move sequences for the early game.',
      mechanics: [
        'Each opening has a set of positions with recommended moves',
        'When your bot encounters a known position, it follows the book',
        'Proficiency determines how often the book is followed (20-100%)',
        'Drill to increase proficiency from the starting 20%',
        'The bot\'s best opening (highest proficiency) is used in games',
      ],
      categories: [
        { name: 'Tactical', example: 'Italian Game, Pirc Defense', suited: 'High aggression/tactical bots' },
        { name: 'Aggressive', example: 'Sicilian, King\'s Indian', suited: 'Aggressive alignment bots' },
        { name: 'Positional', example: 'Queen\'s Gambit, Ruy Lopez', suited: 'Positional/balanced bots' },
        { name: 'Defensive', example: 'London System, Caro-Kann', suited: 'Defensive alignment bots' },
      ],
    },

    cosmetics: {
      title: 'Cosmetics & ASCII Art',
      description: 'Your bot\'s appearance evolves as it levels up.',
      tiers: [
        { tier: 1, levels: '1-4', description: 'Simple pixel face' },
        { tier: 2, levels: '5-8', description: 'Animated expressions' },
        { tier: 3, levels: '9-12', description: 'Detailed character with accessories' },
        { tier: 4, levels: '13-16', description: 'Full scene with effects' },
        { tier: 5, levels: '17-20', description: 'Legendary alignment-specific art' },
      ],
    },
  }
}

/**
 * Onboarding guide for first-time players.
 */
export function getOnboardingGuide() {
  return {
    title: 'Create Your First ChessMon Bot',
    steps: [
      {
        step: 1,
        title: 'Choose a Name',
        description: 'Give your bot a name (2-30 characters). This is how others will know it on the leaderboard.',
        tip: 'Names are unique — pick something memorable!',
      },
      {
        step: 2,
        title: 'Distribute 50 Attribute Points',
        description: 'Spread 50 points across Aggression, Positional, Tactical, Endgame, and Creativity (each 0-20).',
        builds: [
          {
            name: 'The Berserker',
            distribution: { aggression: 18, positional: 5, tactical: 15, endgame: 5, creativity: 7 },
            description: 'All-in attacker. Overwhelms with captures and checks.',
          },
          {
            name: 'The Scholar',
            distribution: { aggression: 5, positional: 18, tactical: 10, endgame: 12, creativity: 5 },
            description: 'Plays the best moves. Grinds opponents with solid play.',
          },
          {
            name: 'The Trickster',
            distribution: { aggression: 8, positional: 5, tactical: 12, endgame: 5, creativity: 20 },
            description: 'Unpredictable genius. Makes surprising moves that confuse opponents.',
          },
          {
            name: 'The Wall',
            distribution: { aggression: 3, positional: 15, tactical: 5, endgame: 20, creativity: 7 },
            description: 'Unbreakable defender. Simplifies to endgame and converts precisely.',
          },
        ],
      },
      {
        step: 3,
        title: 'Pick Your Alignments',
        description: 'Choose an Attack alignment (aggressive/balanced/defensive) and a Style alignment (chaotic/positional/sacrificial).',
        combos: [
          { attack: 'aggressive', style: 'sacrificial', vibe: 'Fearless attacker who risks everything for glory' },
          { attack: 'defensive', style: 'positional', vibe: 'Unshakable fortress — patient and precise' },
          { attack: 'balanced', style: 'chaotic', vibe: 'Flexible wildcard — impossible to prepare against' },
          { attack: 'aggressive', style: 'chaotic', vibe: 'Chaos incarnate — wild, aggressive, unpredictable' },
        ],
      },
      {
        step: 4,
        title: 'Start Training!',
        description: 'You begin at level 1 with energy and a hand of cards. Here\'s your optimal first session:',
        plan: [
          'Hit Quick Spar to play your first game — the ML model needs data',
          'Wait for the spar timer, then spar again (win streaks speed it up!)',
          'Play prep cards from your hand to buff your next fight',
          'Purchase an opening that matches your style from the catalog',
          'Drill that opening to boost proficiency',
          'Defeat the 3 ladder opponents, then challenge the boss!',
        ],
      },
    ],
  }
}
