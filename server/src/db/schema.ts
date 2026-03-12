import { sqliteTable, text, integer, blob, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  cosmeticsJson: text('cosmetics_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const bots = sqliteTable('bots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id').notNull().references(() => players.id),
  name: text('name').notNull().unique(),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  elo: integer('elo').notNull().default(400),
  gamesPlayed: integer('games_played').notNull().default(0),

  aggression: integer('aggression').notNull(),
  positional: integer('positional').notNull(),
  tactical: integer('tactical').notNull(),
  endgame: integer('endgame').notNull(),
  creativity: integer('creativity').notNull(),

  alignmentAttack: text('alignment_attack').notNull(), // 'aggressive' | 'balanced' | 'defensive'
  alignmentStyle: text('alignment_style').notNull(),   // 'chaotic' | 'positional' | 'sacrificial'

  trainingPointsRemaining: integer('training_points_remaining').notNull().default(10),
  mlWeightsBlob: blob('ml_weights_blob', { mode: 'buffer' }),
  asciiTier: integer('ascii_tier').notNull().default(1),
  skinId: text('skin_id'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const botTactics = sqliteTable('bot_tactics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botId: integer('bot_id').notNull().references(() => bots.id),
  tacticKey: text('tactic_key').notNull(),
  proficiency: integer('proficiency').notNull().default(20),
  acquiredAt: integer('acquired_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('bot_tactic_unique').on(table.botId, table.tacticKey),
])

export const trainingLog = sqliteTable('training_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botId: integer('bot_id').notNull().references(() => bots.id),
  level: integer('level').notNull(),
  actionType: text('action_type').notNull(), // 'spar' | 'purchase_tactic' | 'drill'
  detailsJson: text('details_json').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const gameRecords = sqliteTable('game_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  whiteBotId: integer('white_bot_id'),
  blackBotId: integer('black_bot_id'),
  whiteSystemLevel: integer('white_system_level'),
  blackSystemLevel: integer('black_system_level'),
  pgn: text('pgn').notNull(),
  result: text('result').notNull(), // '1-0' | '0-1' | '1/2-1/2'
  moveCount: integer('move_count').notNull(),
  context: text('context').notNull(), // 'training' | 'level_test' | 'human_play'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const levelTests = sqliteTable('level_tests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botId: integer('bot_id').notNull().references(() => bots.id),
  level: integer('level').notNull(),
  opponentsJson: text('opponents_json').notNull(),
  resultsJson: text('results_json').notNull(),
  gameIdsJson: text('game_ids_json').notNull(),
  passed: integer('passed').notNull(), // 0 or 1
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const playSessions = sqliteTable('play_sessions', {
  id: text('id').primaryKey(), // UUID
  botId: integer('bot_id').notNull().references(() => bots.id),
  fen: text('fen').notNull(),
  pgnSoFar: text('pgn_so_far').notNull().default(''),
  playerColor: text('player_color').notNull(), // 'w' | 'b'
  status: text('status').notNull().default('active'), // 'active' | 'complete'
  result: text('result'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
