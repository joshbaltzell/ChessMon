import { eq } from 'drizzle-orm'
import { bots } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { PreferenceModel } from './preference-model.js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

interface CacheEntry {
  model: PreferenceModel
  lastAccessed: number
}

const modelCache = new Map<number, CacheEntry>()
const MAX_CACHE_SIZE = 50 // Evict LRU models when cache exceeds this

// Archetype weights cache (loaded once from disk)
let archetypeWeights: Record<string, Buffer> | null = null

function getArchetypesPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return join(__dirname, '..', 'data', 'archetypes.json')
}

/**
 * Load archetype weights from the data directory.
 * Returns the weight blob for the given alignment key, or null if not found.
 */
function loadArchetypeWeights(alignmentAttack: string, alignmentStyle: string): Buffer | null {
  if (!archetypeWeights) {
    const path = getArchetypesPath()
    if (!existsSync(path)) return null
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>
      archetypeWeights = {}
      for (const [key, base64] of Object.entries(raw)) {
        archetypeWeights[key] = Buffer.from(base64, 'base64')
      }
    } catch {
      return null
    }
  }

  const key = `${alignmentAttack}_${alignmentStyle}`
  return archetypeWeights[key] ?? null
}

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
 * Get or create a model for a bot. If no trained model exists,
 * initializes from the archetype matching the bot's alignment
 * so the bot starts with a style personality from game 0.
 */
export async function getOrCreateModel(
  db: DrizzleDb,
  botId: number,
  alignmentAttack?: string,
  alignmentStyle?: string,
): Promise<PreferenceModel> {
  const existing = await loadModel(db, botId)
  if (existing) return existing

  const model = new PreferenceModel()

  // Try to initialize from archetype weights
  if (alignmentAttack && alignmentStyle) {
    const archetypeBlob = loadArchetypeWeights(alignmentAttack, alignmentStyle)
    if (archetypeBlob) {
      try {
        await model.deserialize(archetypeBlob)
      } catch {
        // Failed to load archetype, use random initialization
      }
    }
  }

  evictIfNeeded()
  modelCache.set(botId, { model, lastAccessed: Date.now() })
  return model
}

export function clearModelCache(): void {
  for (const entry of modelCache.values()) {
    entry.model.dispose()
  }
  modelCache.clear()
  archetypeWeights = null
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
