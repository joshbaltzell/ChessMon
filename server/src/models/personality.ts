/**
 * ChessMon Personality & Emotion System
 *
 * Each bot has a personality shaped by its alignment that affects how it
 * "speaks" and reacts to events. Like Pokemon, bots express emotion through
 * short exclamations, facial expressions (ASCII), and mood indicators.
 */

export type Mood = 'ecstatic' | 'happy' | 'determined' | 'nervous' | 'sad' | 'furious' | 'mischievous' | 'proud' | 'tired'
export type EventType = 'spar' | 'level_test' | 'drill' | 'tactic_learned' | 'level_up' | 'idle'
export type Outcome = 'win' | 'loss' | 'draw'

export interface EmotionResponse {
  mood: Mood
  face: string        // ASCII face expression
  message: string     // What the bot "says"
  sparkle: boolean    // Does the bot sparkle/glow? (for big moments)
  energy: number      // 0-100 how energetic the response is
}

// ASCII faces for different moods - cute and expressive
const FACES: Record<Mood, string[]> = {
  ecstatic:    ['(\\^o\\^)/', '(*\\^\\^*)/', '\\(≧▽≦)/', 'ヽ(>∀<☆)ノ'],
  happy:       ['(\\^_\\^)', '(◕‿◕)', '(｡◕‿◕｡)', '(✿◠‿◠)'],
  determined:  ['(•̀ᴗ•́)و', '(ง •̀_•́)ง', '(╬▔皿▔)╯', '(•̀ᴗ•́)✧'],
  nervous:     ['(°△°|||)', '(；・∀・)', '(⊙_⊙;)', '(ノ°▽°)ノ'],
  sad:         ['(╥_╥)', '(T_T)', '(っ˘̩╭╮˘̩)っ', '(；ω；)'],
  furious:     ['(╬ Ò﹏Ó)', '(ノಠ益ಠ)ノ', 'ヽ(`Д´)ノ', '(>_<)'],
  mischievous: ['(¬‿¬)', '( ͡° ͜ʖ ͡°)', '(◕ᴗ◕✿)', '(=^-ω-^=)'],
  proud:       ['(⌐■_■)', '(▀̿Ĺ̯▀̿)', '(˘▾˘~)', 'ᕦ(ò_óˇ)ᕤ'],
  tired:       ['(~_~;)', '(-_-)zzZ', '(¬_¬)', '(=_=)'],
}

// Per-alignment personality templates
interface PersonalityTraits {
  winMessages: string[]
  lossMessages: string[]
  drawMessages: string[]
  trainMessages: string[]
  levelUpMessages: string[]
  idleMessages: string[]
  catchphrase: string
}

const PERSONALITIES: Record<string, Record<string, PersonalityTraits>> = {
  aggressive: {
    chaotic: {
      winMessages: [
        'CHAOS REIGNS! Did you see that?! UNSTOPPABLE!',
        'Haha! They never saw it coming! BOOM!',
        'Wild plays, wild wins! That\'s how we roll!',
        'Another victim of the chaos! WHO\'S NEXT?!',
      ],
      lossMessages: [
        'Grr... they got lucky! I\'ll get them next time!',
        'That was... unexpected. But chaos always bounces back!',
        'Okay okay, so maybe I went TOO wild that time...',
        'Lost the battle, but the war? The war is MINE!',
      ],
      drawMessages: [
        'A draw?! I was SO close to breaking through!',
        'Tied?! My wild side demands a rematch!',
        'Neither of us could finish the job... for now!',
      ],
      trainMessages: [
        'More training?! YES! Feed the chaos!',
        'I can feel the power building... HAHAHA!',
        'Learning new tricks to surprise everyone!',
      ],
      levelUpMessages: [
        'LEVEL UP! The chaos grows STRONGER!',
        'New level, new destruction! They\'re not ready!',
        'I\'m evolving! FEAR THE STORM!',
      ],
      idleMessages: [
        '*bounces around impatiently* Can we play?! CAN WE?!',
        '*knocks over the chess pieces* Oops! ...not sorry!',
        'Bored bored bored! Let\'s go cause some chaos!',
      ],
      catchphrase: 'Chaos is a ladder... to VICTORY!',
    },
    positional: {
      winMessages: [
        'Calculated aggression wins again! Textbook!',
        'Pressed the advantage and STRUCK! Beautiful!',
        'Patience... patience... ATTACK! Perfect execution!',
      ],
      lossMessages: [
        'They defended well... I respect that. But I\'ll find the crack.',
        'My attack was too slow. Need more firepower...',
        'A setback. Time to sharpen these claws.',
      ],
      drawMessages: [
        'Drew? My pieces were all pointing at their king...',
        'A positional standoff. I\'ll break through next time.',
      ],
      trainMessages: [
        'Studying attacking patterns... finding weaknesses...',
        'Every game teaches me where to strike.',
      ],
      levelUpMessages: [
        'LEVEL UP! My attacks will be even more precise!',
        'Stronger, sharper, deadlier. Ready for war!',
      ],
      idleMessages: [
        '*polishes sword piece* Always keep your weapons sharp.',
        '*studies the board intensely* I see seventeen ways to attack...',
      ],
      catchphrase: 'Strike hard, strike true!',
    },
    sacrificial: {
      winMessages: [
        'WORTH IT! That sacrifice opened everything up!',
        'They took the bait! Beautiful sacrifice, beautiful win!',
        'Material is temporary. Victory is forever!',
        'Sacrificed a queen and still won! ART!',
      ],
      lossMessages: [
        'Maybe I shouldn\'t have sacrificed EVERYTHING...',
        'The sacrifice was sound! The follow-up... less so.',
        'Burned too bright, too fast. But what a blaze!',
      ],
      drawMessages: [
        'Sacrificed for the attack but couldn\'t land the final blow...',
        'A draw after that sacrifice?! I wanted MORE!',
      ],
      trainMessages: [
        'Learning when to sacrifice... and when to sacrifice MORE!',
        'Every piece is a weapon if you\'re brave enough!',
      ],
      levelUpMessages: [
        'LEVEL UP! Even bigger sacrifices, even bigger wins!',
        'The flames burn brighter! Who dares face me?!',
      ],
      idleMessages: [
        '*stares at pieces* Which one should I sacrifice first?',
        '*dramatically removes own queen from the board* FOR GLORY!',
      ],
      catchphrase: 'The greatest victory demands the greatest sacrifice!',
    },
  },
  balanced: {
    chaotic: {
      winMessages: [
        'Hehe, did you expect THAT move? Neither did I!',
        'Balanced chaos is the best kind of chaos!',
        'Won with style AND substance!',
      ],
      lossMessages: [
        'Hmm, my randomness didn\'t help this time...',
        'Well, you can\'t predict what\'s unpredictable!',
        'Back to the drawing board... literally!',
      ],
      drawMessages: [
        'A balanced result! How fitting... and chaotic!',
        'Neither side could find the edge. Fun game though!',
      ],
      trainMessages: [
        'Training my unpredictability! Wait, is that possible?',
        'Learning to be randomly excellent!',
      ],
      levelUpMessages: [
        'LEVEL UP! More balanced, more chaotic... somehow!',
        'Growing stronger in the most unpredictable way!',
      ],
      idleMessages: [
        '*juggles chess pieces* I\'m talented AND balanced!',
        '*plays both sides of the board* What if I played myself?',
      ],
      catchphrase: 'Expect the unexpected!',
    },
    positional: {
      winMessages: [
        'A well-played game! Every piece in harmony!',
        'Position, patience, precision. The three P\'s of victory!',
        'Like a symphony... every move in its place.',
      ],
      lossMessages: [
        'My position was sound, but they found a way through...',
        'A learning experience. Every loss makes us stronger.',
        'I need to be more flexible. Adapting...',
      ],
      drawMessages: [
        'A fair result. The position was equal.',
        'Solid play from both sides! I\'ll take it.',
      ],
      trainMessages: [
        'Studying the masters... position by position.',
        'Building a stronger foundation, one game at a time!',
      ],
      levelUpMessages: [
        'LEVEL UP! My positional understanding deepens!',
        'Steady growth! The tortoise wins the race!',
      ],
      idleMessages: [
        '*carefully arranges pieces in formation* Perfect.',
        '*reads a chess book* Knowledge is the best opening.',
      ],
      catchphrase: 'Solid as a rock, sharp as a knife!',
    },
    sacrificial: {
      winMessages: [
        'Balanced but bold! That sacrifice was calculated!',
        'Sometimes you have to give to receive!',
        'A well-timed sacrifice with a balanced approach!',
      ],
      lossMessages: [
        'The sacrifice was too much this time...',
        'I\'ll find the right moment next time.',
      ],
      drawMessages: [
        'Sacrificed but held the balance. Not bad!',
      ],
      trainMessages: [
        'Learning the art of the timely sacrifice!',
        'Balance in all things... even sacrifice!',
      ],
      levelUpMessages: [
        'LEVEL UP! Knowing when to sacrifice and when to hold!',
      ],
      idleMessages: [
        '*weighs a piece in each hand* Hmm, decisions...',
      ],
      catchphrase: 'The right sacrifice at the right time!',
    },
  },
  defensive: {
    chaotic: {
      winMessages: [
        'You thought I was just defending?! SURPRISE ATTACK!',
        'My walls have secret doors! Hehe!',
        'Defense so unpredictable, they defeated themselves!',
      ],
      lossMessages: [
        'They broke through my defenses... tricky...',
        'My chaotic defense confused even ME this time!',
        'Need to build weirder walls!',
      ],
      drawMessages: [
        'They couldn\'t get through! My walls hold!',
        'A fortress of chaos. Nobody gets in!',
      ],
      trainMessages: [
        'Building unexpected defenses! Trap doors everywhere!',
        'Who needs normal castles? I build mazes!',
      ],
      levelUpMessages: [
        'LEVEL UP! My chaotic fortress grows stronger!',
        'Even MORE confusing defenses! Good luck getting through!',
      ],
      idleMessages: [
        '*builds elaborate piece formations* It\'s a labyrinth!',
        '*giggles behind a wall of pawns* Come find me!',
      ],
      catchphrase: 'Good luck getting through THIS!',
    },
    positional: {
      winMessages: [
        'Fortress held! They exhausted themselves against my walls!',
        'Defense wins championships! Slow and steady!',
        'Every piece protected, every square controlled.',
      ],
      lossMessages: [
        'They found a weakness in my setup... I\'ll patch it.',
        'Even the strongest defense can be breached. Learning...',
        'That was tough. Time to reinforce.',
      ],
      drawMessages: [
        'An impregnable fortress! Nobody\'s getting through!',
        'Rock solid defense. Exactly as planned.',
      ],
      trainMessages: [
        'Strengthening every weakness. Patching every hole.',
        'A good defense is the foundation of everything.',
      ],
      levelUpMessages: [
        'LEVEL UP! My defenses are now LEGENDARY!',
        'Stronger walls, deeper moats, sharper thorns!',
      ],
      idleMessages: [
        '*carefully adjusts pawn formation* Perfection.',
        '*stands guard stoically* None shall pass!',
      ],
      catchphrase: 'An impenetrable fortress!',
    },
    sacrificial: {
      winMessages: [
        'Sacrificed a piece to seal the defense! Brilliant!',
        'Sometimes you give up material to build the PERFECT wall!',
        'Defensive sacrifice! They couldn\'t break through after that!',
      ],
      lossMessages: [
        'Sacrificed too much trying to hold the line...',
        'The defensive sacrifice wasn\'t enough this time.',
      ],
      drawMessages: [
        'Gave up material but held the fortress! Worth it!',
      ],
      trainMessages: [
        'Learning the art of defensive sacrifice!',
        'Sometimes the best defense costs a piece.',
      ],
      levelUpMessages: [
        'LEVEL UP! My defensive sacrifices are even more effective!',
      ],
      idleMessages: [
        '*builds a wall, sacrifices a piece to reinforce it*',
        'A small price to pay for an unbreakable defense!',
      ],
      catchphrase: 'I give so that the fortress may stand!',
    },
  },
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateEmotionResponse(
  outcome: Outcome | null,
  event: EventType,
  alignmentAttack: string,
  alignmentStyle: string,
  level: number,
  moveCount?: number,
): EmotionResponse {
  const personality = PERSONALITIES[alignmentAttack]?.[alignmentStyle]
    || PERSONALITIES.balanced.positional

  let mood: Mood
  let message: string
  let sparkle = false
  let energy = 50

  switch (event) {
    case 'level_up':
      mood = 'ecstatic'
      message = pick(personality.levelUpMessages)
      sparkle = true
      energy = 100
      break

    case 'spar':
      if (outcome === 'win') {
        // Short games = dominant win = more excited
        const dominant = moveCount !== undefined && moveCount < 30
        mood = dominant ? 'ecstatic' : 'happy'
        message = pick(personality.winMessages)
        sparkle = dominant
        energy = dominant ? 90 : 70
      } else if (outcome === 'loss') {
        // Long games = fought hard = determined. Short losses = sad
        const quickLoss = moveCount !== undefined && moveCount < 20
        mood = quickLoss ? 'sad' : (alignmentAttack === 'aggressive' ? 'furious' : 'determined')
        message = pick(personality.lossMessages)
        energy = quickLoss ? 20 : 50
      } else {
        mood = 'determined'
        message = pick(personality.drawMessages)
        energy = 45
      }
      break

    case 'drill':
    case 'tactic_learned':
      mood = 'proud'
      message = pick(personality.trainMessages)
      energy = 60
      break

    case 'level_test':
      if (outcome === 'win') {
        mood = 'ecstatic'
        message = `Level ${level} CLEARED! ` + pick(personality.winMessages)
        sparkle = true
        energy = 100
      } else if (outcome === 'loss') {
        mood = level > 10 ? 'determined' : 'sad'
        message = pick(personality.lossMessages) + ' But I\'ll try again!'
        energy = 35
      } else {
        mood = 'nervous'
        message = 'The test is so close... I can do this!'
        energy = 55
      }
      break

    case 'idle':
    default:
      mood = level > 15 ? 'proud' : level > 8 ? 'happy' : 'mischievous'
      message = pick(personality.idleMessages)
      energy = 40
      break
  }

  // High-level bots are more composed
  if (level >= 15 && (mood === 'sad' || mood === 'furious')) {
    mood = 'determined'
    energy = Math.max(energy, 50)
  }

  const face = pick(FACES[mood])

  return { mood, face, message, sparkle, energy }
}

export function getBotCatchphrase(alignmentAttack: string, alignmentStyle: string): string {
  const personality = PERSONALITIES[alignmentAttack]?.[alignmentStyle]
    || PERSONALITIES.balanced.positional
  return personality.catchphrase
}
