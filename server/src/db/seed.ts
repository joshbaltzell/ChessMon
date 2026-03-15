import { initializeDb, getDb } from './connection.js'
import { players, bots } from './schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

/**
 * Seed the database with demo data for testing.
 * Creates a demo player with a bot at each alignment combination.
 */
export async function seed() {
  initializeDb()
  const db = getDb()

  console.log('Seeding database...')

  // Create demo player if not exists
  const existingPlayer = db.select().from(players).where(eq(players.username, 'demo')).get()
  if (!existingPlayer) {
    const passwordHash = await bcrypt.hash('demo123', 10)
    db.insert(players).values({
      username: 'demo',
      passwordHash,
    }).run()
    console.log('Created demo player (username: demo, password: demo123)')
  }

  const demoPlayer = db.select().from(players).where(eq(players.username, 'demo')).get()!

  // Create demo bot if not exists
  const existingBot = db.select().from(bots).where(eq(bots.playerId, demoPlayer.id)).get()
  if (!existingBot) {
    db.insert(bots).values({
      playerId: demoPlayer.id,
      name: 'ChaosFlame',
      aggression: 15,
      positional: 5,
      tactical: 15,
      endgame: 5,
      creativity: 10,
      alignmentAttack: 'aggressive',
      alignmentStyle: 'chaotic',
    }).run()
    console.log('Created demo bot: ChaosFlame (aggressive/chaotic)')
  }

  // Create some additional player bots for level test matchmaking
  const sparringPartners = [
    { username: 'npc_fortress', password: 'npc', botName: 'IronFortress', attrs: { aggression: 5, positional: 15, tactical: 5, endgame: 15, creativity: 10 }, attack: 'defensive' as const, style: 'positional' as const, level: 3, elo: 600 },
    { username: 'npc_storm', password: 'npc', botName: 'ThunderStorm', attrs: { aggression: 18, positional: 5, tactical: 15, endgame: 2, creativity: 10 }, attack: 'aggressive' as const, style: 'sacrificial' as const, level: 5, elo: 850 },
    { username: 'npc_scholar', password: 'npc', botName: 'QuietScholar', attrs: { aggression: 5, positional: 18, tactical: 10, endgame: 12, creativity: 5 }, attack: 'balanced' as const, style: 'positional' as const, level: 7, elo: 1050 },
    { username: 'npc_wild', password: 'npc', botName: 'WildCard', attrs: { aggression: 10, positional: 5, tactical: 10, endgame: 5, creativity: 20 }, attack: 'balanced' as const, style: 'chaotic' as const, level: 4, elo: 700 },
    { username: 'npc_grinder', password: 'npc', botName: 'EndgameGrinder', attrs: { aggression: 5, positional: 10, tactical: 5, endgame: 20, creativity: 10 }, attack: 'defensive' as const, style: 'sacrificial' as const, level: 8, elo: 1150 },
  ]

  for (const sp of sparringPartners) {
    const existing = db.select().from(players).where(eq(players.username, sp.username)).get()
    if (!existing) {
      const passwordHash = await bcrypt.hash(sp.password, 10)
      db.insert(players).values({ username: sp.username, passwordHash }).run()
      const player = db.select().from(players).where(eq(players.username, sp.username)).get()!

      db.insert(bots).values({
        playerId: player.id,
        name: sp.botName,
        level: sp.level,
        elo: sp.elo,
        gamesPlayed: sp.level * 10,
        aggression: sp.attrs.aggression,
        positional: sp.attrs.positional,
        tactical: sp.attrs.tactical,
        endgame: sp.attrs.endgame,
        creativity: sp.attrs.creativity,
        alignmentAttack: sp.attack,
        alignmentStyle: sp.style,
        trainingPointsRemaining: 0,
      }).run()
      console.log(`Created NPC bot: ${sp.botName} (${sp.attack}/${sp.style}) level ${sp.level}`)
    }
  }

  console.log('Seeding complete!')
}

// Run directly
seed().catch(console.error)
