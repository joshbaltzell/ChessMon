import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { config } from '../config.js'

let db: ReturnType<typeof createDb> | null = null

function createDb(dbPath?: string) {
  const sqlite = new Database(dbPath || config.dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function getDb(dbPath?: string) {
  if (!db) {
    db = createDb(dbPath)
  }
  return db
}

export function initializeDb(dbPath?: string) {
  const database = getDb(dbPath)
  const sqlite = (database as any).session?.client as Database.Database | undefined
  const rawDb = sqlite || new Database(dbPath || config.dbPath)

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      cosmetics_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id),
      name TEXT NOT NULL UNIQUE,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      elo INTEGER NOT NULL DEFAULT 400,
      games_played INTEGER NOT NULL DEFAULT 0,
      aggression INTEGER NOT NULL CHECK(aggression >= 0 AND aggression <= 20),
      positional INTEGER NOT NULL CHECK(positional >= 0 AND positional <= 20),
      tactical INTEGER NOT NULL CHECK(tactical >= 0 AND tactical <= 20),
      endgame INTEGER NOT NULL CHECK(endgame >= 0 AND endgame <= 20),
      creativity INTEGER NOT NULL CHECK(creativity >= 0 AND creativity <= 20),
      alignment_attack TEXT NOT NULL CHECK(alignment_attack IN ('aggressive', 'balanced', 'defensive')),
      alignment_style TEXT NOT NULL CHECK(alignment_style IN ('chaotic', 'positional', 'sacrificial')),
      training_points_remaining INTEGER NOT NULL DEFAULT 10,
      ml_weights_blob BLOB,
      ml_replay_buffer BLOB,
      ascii_tier INTEGER NOT NULL DEFAULT 1,
      skin_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bot_tactics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      tactic_key TEXT NOT NULL,
      proficiency INTEGER NOT NULL DEFAULT 20 CHECK(proficiency >= 0 AND proficiency <= 100),
      acquired_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(bot_id, tactic_key)
    );

    CREATE TABLE IF NOT EXISTS training_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      level INTEGER NOT NULL,
      action_type TEXT NOT NULL CHECK(action_type IN ('spar', 'purchase_tactic', 'drill')),
      details_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS game_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      white_bot_id INTEGER,
      black_bot_id INTEGER,
      white_system_level INTEGER,
      black_system_level INTEGER,
      pgn TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('1-0', '0-1', '1/2-1/2')),
      move_count INTEGER NOT NULL,
      context TEXT NOT NULL CHECK(context IN ('training', 'level_test', 'human_play')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS level_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      level INTEGER NOT NULL,
      opponents_json TEXT NOT NULL,
      results_json TEXT NOT NULL,
      game_ids_json TEXT NOT NULL,
      passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS card_hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      round_number INTEGER NOT NULL DEFAULT 1,
      energy INTEGER NOT NULL,
      max_energy INTEGER NOT NULL,
      hand_json TEXT NOT NULL DEFAULT '[]',
      cards_played_this_round INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ladder_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      target_level INTEGER NOT NULL,
      opponent_index INTEGER NOT NULL,
      opponent_name TEXT NOT NULL,
      opponent_level INTEGER NOT NULL,
      defeated INTEGER NOT NULL DEFAULT 0,
      game_record_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS play_sessions (
      id TEXT PRIMARY KEY,
      bot_id INTEGER NOT NULL REFERENCES bots(id),
      fen TEXT NOT NULL,
      pgn_so_far TEXT NOT NULL DEFAULT '',
      player_color TEXT NOT NULL CHECK(player_color IN ('w', 'b')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'complete')),
      result TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_bots_player_id ON bots(player_id);
    CREATE INDEX IF NOT EXISTS idx_bots_elo ON bots(elo);
    CREATE INDEX IF NOT EXISTS idx_bots_level ON bots(level);
    CREATE INDEX IF NOT EXISTS idx_game_records_context ON game_records(context);
  `)

  return database
}

export type DrizzleDb = ReturnType<typeof getDb>
