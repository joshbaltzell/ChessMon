import { eq } from 'drizzle-orm'
import { bots } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { PreferenceModel } from './preference-model.js'

interface CacheEntry {
  model: PreferenceModel
  lastAccessed: number
}

const modelCache = new Map<number, CacheEntry>()
const MAX_CACHE_SIZE = 50 // Evict LRU models when cache exceeds this

/**
 * Load a bot's ML model from the database (with LRU-evicting in-memory cache).
 * Returns null if the bot has never been trained.
 */
export async function loadModel(db: DrizzleDb, botId: number): Promise<PreferenceModel | null> {
  const cached = modelCache.get(botId)
  if (cached) {
    cached.lastAccessed = Date.now()
    return cached.model
  }

  const bot = db.select({ mlWeightsBlob: bots.mlWeightsBlob }).from(bots).where(eq(bots.id, botId)).get()
  if (!bot || !bot.mlWeightsBlob) {
    return null
  }

  const model = new PreferenceModel()
  await model.deserialize(bot.mlWeightsBlob)

  evictIfNeeded()
  modelCache.set(botId, { model, lastAccessed: Date.now() })
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

  evictIfNeeded()
  modelCache.set(botId, { model, lastAccessed: Date.now() })
}

/**
 * Get or create a model for a bot. Creates a fresh untrained model if none exists.
 */
export async function getOrCreateModel(db: DrizzleDb, botId: number): Promise<PreferenceModel> {
  const existing = await loadModel(db, botId)
  if (existing) return existing

  const model = new PreferenceModel()
  evictIfNeeded()
  modelCache.set(botId, { model, lastAccessed: Date.now() })
  return model
}

export function clearModelCache(): void {
  for (const entry of modelCache.values()) {
    entry.model.dispose()
  }
  modelCache.clear()
}

export function getModelCacheStats() {
  return {
    size: modelCache.size,
    maxSize: MAX_CACHE_SIZE,
    botIds: Array.from(modelCache.keys()),
  }
}

function evictIfNeeded(): void {
  if (modelCache.size < MAX_CACHE_SIZE) return

  // Find LRU entry
  let oldestKey: number | null = null
  let oldestTime = Infinity

  for (const [key, entry] of modelCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed
      oldestKey = key
    }
  }

  if (oldestKey !== null) {
    const entry = modelCache.get(oldestKey)
    entry?.model.dispose()
    modelCache.delete(oldestKey)
  }
}
