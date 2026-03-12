export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || './chessmon.db',
  jwtSecret: process.env.JWT_SECRET || 'chessmon-dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  stockfishPoolSize: parseInt(process.env.STOCKFISH_POOL_SIZE || '4', 10),
  maxGameMoves: 200,
}
