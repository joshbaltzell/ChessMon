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
      description: 'Each level grants training points. Spend them wisely before attempting the level test.',
      actions: [
        {
          name: 'Spar',
          cost: 2,
          description: 'Play a full game against a system bot or another player\'s bot. Your bot\'s ML model learns from every game — which moves led to wins, which to losses. Gains 20 XP.',
        },
        {
          name: 'Purchase Tactic',
          cost: 3,
          description: 'Buy a tactic or opening from the catalog. Opening tactics give your bot a "book" of known positions. Other tactics affect attribute bonuses.',
        },
        {
          name: 'Drill',
          cost: 1,
          description: 'Practice an owned tactic. Increases proficiency (starts at 20%, caps at 100%). Higher proficiency = more likely to follow the opening book correctly.',
        },
      ],
      strategy: [
        'At level 1 (10 points): 3 spars (6) + 1 tactic purchase (3) + 1 drill (1) = 10 points',
        'Prioritize spars early — the ML model needs games to learn from',
        'Purchase openings that match your alignment (aggressive bots love the Sicilian)',
        'Drill before a level test — high proficiency opening play gives a real edge',
      ],
    },

    levelTests: {
      title: 'Level Tests',
      description: 'To advance from level N to N+1, your bot must pass the level test by winning enough games against opponents near the target elo.',
      mechanics: [
        'Each level has a target elo and a number of test games (3-5)',
        'You need to win a majority of the test games to pass',
        'Failing grants +5 bonus training points to try again',
        'Lower levels face only system bots; higher levels face player bots too',
        'Level 20 is the ceiling — beat the Stockfish Ceiling bot to max out',
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
        description: 'You begin at level 1 with 10 training points. Here\'s your optimal first session:',
        plan: [
          'Spar 3 times (-6 points) — your ML model needs data to learn',
          'Purchase one opening that matches your style (-3 points)',
          'Drill that opening once (-1 point)',
          'Take the level test!',
        ],
      },
    ],
  }
}
