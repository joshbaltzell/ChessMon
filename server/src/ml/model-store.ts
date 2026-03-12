import { eq } from 'drizzle-orm'
import { bots } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { PreferenceModel } from './preference-model.js'

const modelCache = new Map<number, PreferenceModel>()

/**
 * Load a bot's ML model from the database (with in-memory cache).
 * Returns null if the bot has never been trained.
 */
export async function loadModel(db: DrizzleDb, botId: number): Promise<PreferenceModel | null> {
  if (modelCache.has(botId)) {
    return modelCache.get(botId)!
  }

  const bot = db.select({ mlWeightsBlob: bots.mlWeightsBlob }).from(bots).where(eq(bots.id, botId)).get()
  if (!bot || !bot.mlWeightsBlob) {
    return null
  }

  const model = new PreferenceModel()
  await model.deserialize(bot.mlWeightsBlob)
  modelCache.set(botId, model)
  return model
}

/**
 * Save a bot's ML model weights to the database.
 */
export async function saveModel(db: DrizzleDb, botId: number, model: PreferenceModel): Promise<void> {
  const blob = await model.serialize()
  db.update(bots)
    .set({ mlWeightsBlob: blob })
    .where(eq(bots.id, botId))
    .run()

  modelCache.set(botId, model)
}

/**
 * Get or create a model for a bot. Creates a fresh untrained model if none exists.
 */
export async function getOrCreateModel(db: DrizzleDb, botId: number): Promise<PreferenceModel> {
  const existing = await loadModel(db, botId)
  if (existing) return existing

  const model = new PreferenceModel()
  modelCache.set(botId, model)
  return model
}

export function clearModelCache(): void {
  for (const model of modelCache.values()) {
    model.dispose()
  }
  modelCache.clear()
}
