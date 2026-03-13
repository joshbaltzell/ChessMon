import { z } from 'zod'

// --- Auth ---
export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric or underscore'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters'),
})

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

// --- Bots ---
const VALID_ATTACK_ALIGNMENTS = ['aggressive', 'balanced', 'defensive'] as const
const VALID_STYLE_ALIGNMENTS = ['chaotic', 'positional', 'sacrificial'] as const

export const createBotSchema = z.object({
  name: z.string()
    .min(2, 'Bot name must be at least 2 characters')
    .max(30, 'Bot name must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_ -]+$/, 'Bot name can only contain letters, numbers, spaces, hyphens, and underscores'),
  aggression: z.number().int().min(0).max(20),
  positional: z.number().int().min(0).max(20),
  tactical: z.number().int().min(0).max(20),
  endgame: z.number().int().min(0).max(20),
  creativity: z.number().int().min(0).max(20),
  alignment_attack: z.enum(VALID_ATTACK_ALIGNMENTS),
  alignment_style: z.enum(VALID_STYLE_ALIGNMENTS),
}).refine(
  (data) => data.aggression + data.positional + data.tactical + data.endgame + data.creativity === 50,
  { message: 'Attributes must sum to exactly 50' },
)

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const botIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid bot ID'),
})

// --- Training ---
export const sparSchema = z.object({
  opponent: z.enum(['system', 'player']),
  opponent_level: z.number().int().min(1).max(20).optional(),
  opponent_bot_id: z.number().int().positive().optional(),
}).refine(
  (data) => {
    if (data.opponent === 'system') return data.opponent_level !== undefined
    if (data.opponent === 'player') return data.opponent_bot_id !== undefined
    return true
  },
  { message: 'System opponents need opponent_level, player opponents need opponent_bot_id' },
)

export const tacticKeySchema = z.object({
  tactic_key: z.string().min(1, 'tactic_key is required'),
})

// --- Play ---
export const newGameSchema = z.object({
  player_color: z.enum(['w', 'b']).default('w'),
})

export const moveSchema = z.object({
  move: z.string().min(2, 'Move is required').max(10),
})

export const playSessionParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid bot ID'),
  sessionId: z.string().min(1, 'Session ID is required'),
})

export const levelTestParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid bot ID'),
  testId: z.coerce.number().int().positive('Invalid test ID'),
})

// --- Cards ---
export const playCardSchema = z.object({
  card_id: z.string().min(1, 'card_id is required'),
  // Optional context for cards that need it (e.g. spar needs opponent_level, drill needs tactic_key)
  opponent_level: z.number().int().min(1).max(20).optional(),
  tactic_key: z.string().optional(),
})

// --- Helper ---
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = result.error.issues.map(i => i.message).join('; ')
    const err = new Error(message) as Error & { statusCode: number; code: string }
    err.statusCode = 400
    err.code = 'VALIDATION_ERROR'
    throw err
  }
  return result.data
}
