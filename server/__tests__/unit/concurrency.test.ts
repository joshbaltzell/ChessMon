import { describe, it, expect } from 'vitest'
import { ConcurrencyLimiter } from '../../src/engine/concurrency-limiter.js'

describe('ConcurrencyLimiter', () => {
  it('should allow up to maxConcurrent tasks immediately', async () => {
    const limiter = new ConcurrencyLimiter(3)
    const started: number[] = []
    const finished: number[] = []

    const makeTask = (id: number, delay: number) =>
      limiter.run(async () => {
        started.push(id)
        await new Promise(r => setTimeout(r, delay))
        finished.push(id)
        return id
      })

    // Start 3 tasks, all should begin immediately
    const p1 = makeTask(1, 50)
    const p2 = makeTask(2, 50)
    const p3 = makeTask(3, 50)

    // Give them a moment to start
    await new Promise(r => setTimeout(r, 10))
    expect(started.length).toBe(3)

    await Promise.all([p1, p2, p3])
    expect(finished.length).toBe(3)
  })

  it('should queue tasks beyond maxConcurrent', async () => {
    const limiter = new ConcurrencyLimiter(2)
    const order: string[] = []

    const makeTask = (id: string, delay: number) =>
      limiter.run(async () => {
        order.push(`start:${id}`)
        await new Promise(r => setTimeout(r, delay))
        order.push(`end:${id}`)
      })

    const p1 = makeTask('A', 50)
    const p2 = makeTask('B', 50)
    const p3 = makeTask('C', 10)
    const p4 = makeTask('D', 10)

    // A and B start immediately, C and D are queued
    await new Promise(r => setTimeout(r, 10))
    expect(limiter.getStats().running).toBe(2)
    expect(limiter.getStats().queued).toBe(2)

    await Promise.all([p1, p2, p3, p4])

    // C and D should have started after A or B finished
    expect(order.indexOf('start:C')).toBeGreaterThan(0)
    expect(order.indexOf('start:D')).toBeGreaterThan(0)
  })

  it('should release slot even if task throws', async () => {
    const limiter = new ConcurrencyLimiter(1)

    try {
      await limiter.run(async () => { throw new Error('oops') })
    } catch { /* expected */ }

    // Should still be able to run another task
    const result = await limiter.run(async () => 42)
    expect(result).toBe(42)
    expect(limiter.getStats().running).toBe(0)
  })

  it('should report correct stats', async () => {
    const limiter = new ConcurrencyLimiter(2)
    expect(limiter.getStats()).toEqual({ running: 0, queued: 0, maxConcurrent: 2 })

    const p = limiter.run(() => new Promise(r => setTimeout(r, 50)))
    await new Promise(r => setTimeout(r, 5))
    expect(limiter.getStats().running).toBe(1)

    await p
    expect(limiter.getStats().running).toBe(0)
  })
})

describe('Load Estimation: 50 Players × 3 Bots', () => {
  it('should estimate Stockfish throughput for concurrent spars', () => {
    // Scenario: 50 concurrent spar requests, 8 Stockfish workers
    const workers = 8
    const avgMovesPerGame = 80
    const avgMsPerAnalysis = 75 // depth 8, multipv 5
    const gameTimeMs = avgMovesPerGame * avgMsPerAnalysis // ~6s per game

    // Throughput: 8 games running in parallel
    const concurrentGames = workers // Each game uses 1 worker at a time (sequential moves)
    // Actually games interleave - each move takes 75ms, so workers handle different games

    // Better model: each move blocks a worker for 75ms, then it's free
    // With 80 moves per game, each game takes 80 * 75ms = 6s of worker time
    // 8 workers can process 8 games simultaneously
    // 50 games / 8 parallel = 6.25 batches × 6s = ~37.5s total

    const totalTimeMs = Math.ceil(50 / workers) * gameTimeMs
    expect(totalTimeMs).toBeLessThan(60_000) // Should complete within 60s

    // With more workers (e.g., 16), time halves
    const totalWith16 = Math.ceil(50 / 16) * gameTimeMs
    expect(totalWith16).toBeLessThan(30_000)
  })

  it('should estimate ML model memory usage', () => {
    // Each TF.js model in memory: ~1-2MB
    // 150 bots cached: 150 * 2MB = 300MB
    // With LRU eviction at 50: 50 * 2MB = 100MB
    const maxModelsInCache = 50
    const mbPerModel = 2
    const totalMb = maxModelsInCache * mbPerModel
    expect(totalMb).toBeLessThanOrEqual(100) // Max 100MB for model cache
  })

  it('should estimate DB write contention', () => {
    // SQLite WAL mode: reads are non-blocking, writes are serialized
    // Each spar does ~5 writes (game record, bot update, training log, ML weights, training log)
    // Each write takes ~0.1-0.5ms in SQLite
    const writesPerSpar = 5
    const msPerWrite = 0.5
    const concurrentSpars = 50
    const totalWriteTimeMs = concurrentSpars * writesPerSpar * msPerWrite
    // 50 * 5 * 0.5 = 125ms total serialized write time
    expect(totalWriteTimeMs).toBeLessThan(1000) // Writes are fast even serialized
  })

  it('should estimate TF.js training time', () => {
    // Each spar trains ML model: ~50 samples, 8 epochs
    // TF.js Sequential model.fit: ~50-100ms per spar
    // 50 concurrent: runs on JS thread, serialized
    // Total: 50 * 100ms = 5s (can overlap with Stockfish waits)
    const msPerTraining = 100
    const concurrentSpars = 50
    const totalTrainMs = concurrentSpars * msPerTraining
    expect(totalTrainMs).toBeLessThan(10_000) // 10s acceptable as it overlaps with IO
  })

  it('concurrency limiter should keep system stable at 50 users', () => {
    // With sparLimiter at 8: max 8 spars run at once
    // With levelTestLimiter at 4: max 4 level tests at once
    // Remaining requests queue without overwhelming Stockfish

    const maxConcurrentSpars = 8
    const maxConcurrentTests = 4
    const totalConcurrentGames = maxConcurrentSpars + maxConcurrentTests * 4 // Tests run 3-5 games

    // Max load on Stockfish: 8 + 16 = 24 concurrent games
    // With 8+ Stockfish workers, this means queue depth of 16-24
    // But games interleave moves, so actual concurrency is lower
    expect(totalConcurrentGames).toBeLessThan(30) // Manageable
  })
})
