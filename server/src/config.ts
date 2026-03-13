import { cpus } from 'os'

// Default Stockfish pool size: leave 2 cores for Node.js + TF.js, rest for Stockfish
const defaultPoolSize = Math.max(4, cpus().length - 2)

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || './chessmon.db',
  jwtSecret: process.env.JWT_SECRET || 'chessmon-dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  stockfishPoolSize: parseInt(process.env.STOCKFISH_POOL_SIZE || String(defaultPoolSize), 10),
  stockfishRequestTimeoutMs: parseInt(process.env.STOCKFISH_TIMEOUT_MS || '30000', 10),
  maxGameMoves: 200,
  maxBotsPerPlayer: 3,
  mlModelCacheSize: parseInt(process.env.ML_MODEL_CACHE_SIZE || '50', 10),
  // Concurrency limits for heavy operations
  maxConcurrentSpars: parseInt(process.env.MAX_CONCURRENT_SPARS || '8', 10),
  maxConcurrentLevelTests: parseInt(process.env.MAX_CONCURRENT_LEVEL_TESTS || '4', 10),
  devMode: process.env.DEV_MODE === '1' || process.env.NODE_ENV !== 'production',
}
