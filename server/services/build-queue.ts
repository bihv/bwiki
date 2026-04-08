export interface BuildQueue {
  enqueue: (job: (input: { pendingJobsAfterCurrent: () => number }) => Promise<void>) => Promise<{ status: 'queued' }>
  waitForIdle: () => Promise<void>
}

export interface BuildQueueDependencies {
  onBuilding?: (input: { pendingJobs: number }) => Promise<void> | void
  onQueued?: (input: { isBuilding: boolean; pendingJobs: number }) => Promise<void> | void
}

export function createBuildQueue(dependencies: BuildQueueDependencies = {}): BuildQueue {
  const pendingJobs: Array<(input: { pendingJobsAfterCurrent: () => number }) => Promise<void>> = []
  let isBuilding = false
  let drainPromise: Promise<void> | null = null

  async function drainQueue() {
    isBuilding = true

    try {
      while (pendingJobs.length > 0) {
        const job = pendingJobs.shift()
        if (!job) {
          continue
        }

        await dependencies.onBuilding?.({ pendingJobs: pendingJobs.length })

        try {
          await job({ pendingJobsAfterCurrent: () => pendingJobs.length })
        } catch {
          // Jobs persist failure state on their own. The queue continues with later jobs.
        }
      }
    } finally {
      isBuilding = false
      drainPromise = null
    }
  }

  return {
    async enqueue(job) {
      await dependencies.onQueued?.({
        isBuilding,
        pendingJobs: pendingJobs.length + 1,
      })

      pendingJobs.push(job)

      if (!drainPromise) {
        drainPromise = drainQueue()
      }

      return { status: 'queued' }
    },
    async waitForIdle() {
      while (drainPromise) {
        await drainPromise
      }
    },
  }
}
