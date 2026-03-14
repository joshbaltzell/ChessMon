import type { FastifyRequest, FastifyReply } from 'fastify'

interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Simple in-memory rate limiter. For production, replace with Redis-backed solution.
 * Keyed by IP or playerId (authenticated routes).
 */
export class RateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {
    // Periodically clean expired entries to prevent memory leak
    this.cleanupTimer = setInterval(() => this.cleanup(), windowMs * 2)
    // Don't prevent Node.js from exiting
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true, retryAfterMs: 0 }
    }

    if (entry.count < this.maxRequests) {
      entry.count++
      return { allowed: true, retryAfterMs: 0 }
    }

    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key)
    }
  }

  destroy() {
    clearInterval(this.cleanupTimer)
    this.store.clear()
  }
}

// Pre-configured limiters for different endpoint categories
// Auth: 10 attempts per minute (brute-force protection)
const authLimiter = new RateLimiter(10, 60_000)

// Spar/level-test: 5 requests per minute per player (expensive operations)
const heavyOpLimiter = new RateLimiter(5, 60_000)

// Play moves: 60 per minute (generous but prevents abuse)
const playLimiter = new RateLimiter(60, 60_000)

// General API: 120 requests per minute
const generalLimiter = new RateLimiter(120, 60_000)

function getKey(request: FastifyRequest, prefix: string): string {
  const userId = (request as any).user?.playerId
  if (userId) return `${prefix}:player:${userId}`
  return `${prefix}:ip:${request.ip}`
}

function rejectIfLimited(limiter: RateLimiter, prefix: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = getKey(request, prefix)
    const { allowed, retryAfterMs } = limiter.check(key)
    if (!allowed) {
      reply.header('Retry-After', Math.ceil(retryAfterMs / 1000))
      return reply.status(429).send({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfterMs,
      })
    }
  }
}

export const rateLimitAuth = rejectIfLimited(authLimiter, 'auth')
export const rateLimitHeavy = rejectIfLimited(heavyOpLimiter, 'heavy')
export const rateLimitPlay = rejectIfLimited(playLimiter, 'play')
export const rateLimitGeneral = rejectIfLimited(generalLimiter, 'general')

// Quick spar: 1 request per second per bot (fast but not spammable)
const quickSparLimiter = new RateLimiter(1, 1000)
export const rateLimitQuickSpar = rejectIfLimited(quickSparLimiter, 'qspar')
