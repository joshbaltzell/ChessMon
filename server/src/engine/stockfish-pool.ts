import { fork, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import type { CandidateMove } from '../types/index.js'

const require = createRequire(import.meta.url)

interface AnalysisRequest {
  fen: string
  depth: number
  multiPv: number
  resolve: (moves: CandidateMove[]) => void
  reject: (err: Error) => void
  enqueueTime: number
}

interface StockfishWorker {
  process: ChildProcess
  busy: boolean
  ready: boolean
  id: number
}

export interface PoolStats {
  totalWorkers: number
  busyWorkers: number
  queueDepth: number
  avgWaitMs: number
}

export class StockfishPool {
  private workers: StockfishWorker[] = []
  private queue: AnalysisRequest[] = []
  private enginePath: string
  private nextWorkerId = 0
  private totalWaitMs = 0
  private completedRequests = 0
  private requestTimeout: number

  constructor(
    private poolSize: number = 4,
    options?: { requestTimeoutMs?: number },
  ) {
    this.enginePath = require.resolve('stockfish/bin/stockfish.js')
    this.requestTimeout = options?.requestTimeoutMs ?? 30_000
  }

  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = []

    for (let i = 0; i < this.poolSize; i++) {
      initPromises.push(this.spawnWorker())
    }

    await Promise.all(initPromises)
  }

  /**
   * Dynamically resize the pool. New workers are spawned or excess workers killed.
   */
  async resize(newSize: number): Promise<void> {
    if (newSize < 1) throw new Error('Pool size must be at least 1')

    if (newSize > this.workers.length) {
      const spawnCount = newSize - this.workers.length
      const promises: Promise<void>[] = []
      for (let i = 0; i < spawnCount; i++) {
        promises.push(this.spawnWorker())
      }
      await Promise.all(promises)
    } else if (newSize < this.workers.length) {
      // Kill idle workers first, then busy ones
      const idle = this.workers.filter(w => !w.busy)
      const busy = this.workers.filter(w => w.busy)
      const toKill = [...idle, ...busy].slice(0, this.workers.length - newSize)

      for (const worker of toKill) {
        try {
          worker.process.stdin!.write('quit\n')
          worker.process.kill()
        } catch { /* ignore */ }
        const idx = this.workers.indexOf(worker)
        if (idx >= 0) this.workers.splice(idx, 1)
      }
    }

    this.poolSize = newSize
  }

  getStats(): PoolStats {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueDepth: this.queue.length,
      avgWaitMs: this.completedRequests > 0 ? this.totalWaitMs / this.completedRequests : 0,
    }
  }

  private spawnWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = fork(this.enginePath, [], {
        silent: true,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      })

      const workerId = this.nextWorkerId++
      const worker: StockfishWorker = { process: proc, busy: false, ready: false, id: workerId }
      this.workers.push(worker)

      let initBuffer = ''

      const onData = (data: Buffer) => {
        initBuffer += data.toString()
        if (initBuffer.includes('uciok')) {
          worker.ready = true
          proc.stdout!.removeListener('data', onData)
          // Set minimal resource usage per worker
          proc.stdin!.write('setoption name Threads value 1\n')
          proc.stdin!.write('setoption name Hash value 16\n')
          proc.stdin!.write('isready\n')

          const onReady = (data: Buffer) => {
            if (data.toString().includes('readyok')) {
              proc.stdout!.removeListener('data', onReady)
              resolve()
            }
          }
          proc.stdout!.on('data', onReady)
        }
      }

      proc.stdout!.on('data', onData)
      proc.stderr!.on('data', () => {
        // Stockfish can be noisy on stderr, ignore
      })

      proc.on('error', (err) => {
        if (!worker.ready) reject(err)
      })

      proc.on('exit', () => {
        const idx = this.workers.indexOf(worker)
        if (idx >= 0) this.workers.splice(idx, 1)
        // If worker died unexpectedly and pool is below target size, respawn
        if (this.workers.length < this.poolSize) {
          this.spawnWorker().catch(() => {})
        }
      })

      proc.stdin!.write('uci\n')
    })
  }

  async analyze(fen: string, depth: number, multiPv: number = 5): Promise<CandidateMove[]> {
    return new Promise((resolve, reject) => {
      const request: AnalysisRequest = {
        fen, depth, multiPv, resolve, reject,
        enqueueTime: Date.now(),
      }

      // Timeout: reject if waiting too long in queue
      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(request)
        if (idx >= 0) {
          this.queue.splice(idx, 1)
          reject(new Error(`Analysis request timed out after ${this.requestTimeout}ms`))
        }
      }, this.requestTimeout)

      const originalResolve = resolve
      request.resolve = (moves) => {
        clearTimeout(timer)
        const waitMs = Date.now() - request.enqueueTime
        this.totalWaitMs += waitMs
        this.completedRequests++
        originalResolve(moves)
      }

      const originalReject = reject
      request.reject = (err) => {
        clearTimeout(timer)
        originalReject(err)
      }

      this.queue.push(request)
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.queue.length === 0) return

    const available = this.workers.find(w => w.ready && !w.busy)
    if (!available) return

    const request = this.queue.shift()!
    available.busy = true

    this.runAnalysis(available, request).finally(() => {
      available.busy = false
      this.processQueue()
    })
  }

  private runAnalysis(worker: StockfishWorker, request: AnalysisRequest): Promise<void> {
    return new Promise((resolve) => {
      const candidates: Map<number, CandidateMove> = new Map()
      let buffer = ''

      const onData = (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed.startsWith('info depth')) {
            const parsed = this.parseInfoLine(trimmed, request.depth)
            if (parsed) {
              candidates.set(parsed.pvIndex, parsed.candidate)
            }
          }

          if (trimmed.startsWith('bestmove')) {
            worker.process.stdout!.removeListener('data', onData)

            const result = Array.from(candidates.values())
              .sort((a, b) => (b.centipawns ?? 0) - (a.centipawns ?? 0))

            request.resolve(result)
            resolve()
            return
          }
        }
      }

      worker.process.stdout!.on('data', onData)

      // Send UCI commands
      worker.process.stdin!.write(`setoption name MultiPV value ${request.multiPv}\n`)
      worker.process.stdin!.write(`position fen ${request.fen}\n`)
      worker.process.stdin!.write(`go depth ${request.depth}\n`)
    })
  }

  private parseInfoLine(line: string, targetDepth: number): { pvIndex: number; candidate: CandidateMove } | null {
    const depthMatch = line.match(/depth (\d+)/)
    const multiPvMatch = line.match(/multipv (\d+)/)
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/)
    const pvMatch = line.match(/ pv (.+)$/)

    if (!depthMatch || !scoreMatch || !pvMatch) return null

    const depth = parseInt(depthMatch[1])
    if (depth !== targetDepth) return null

    const pvIndex = multiPvMatch ? parseInt(multiPvMatch[1]) : 1
    const scoreType = scoreMatch[1]
    const scoreValue = parseInt(scoreMatch[2])

    const pv = pvMatch[1].trim().split(/\s+/)

    return {
      pvIndex,
      candidate: {
        move: pv[0],
        centipawns: scoreType === 'cp' ? scoreValue : 0,
        mate: scoreType === 'mate' ? scoreValue : null,
        pv,
      },
    }
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers) {
      try {
        worker.process.stdin!.write('quit\n')
        worker.process.kill()
      } catch {
        // ignore
      }
    }
    this.workers = []
    this.queue = []
  }
}
