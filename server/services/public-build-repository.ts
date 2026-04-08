import { access, cp, mkdir, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export class MissingStagedPublicBuildError extends Error {
  constructor(buildId: string) {
    super(`Staged public build "${buildId}" was not found`)
    this.name = 'MissingStagedPublicBuildError'
  }
}

export interface PublicBuildRepository {
  getPromotedBuildPath: (buildId: string) => string
  getStagingBuildPath: (buildId: string) => string
  promote: (input: { buildId: string }) => Promise<string>
}

export function createPublicBuildRepository(options: { runtimeRootPath?: string } = {}): PublicBuildRepository {
  const runtimeRootPath = resolve(options.runtimeRootPath ?? '.runtime')
  const publicRootPath = join(runtimeRootPath, 'public')
  const stagingRootPath = join(publicRootPath, 'staging')
  const promotedRootPath = join(publicRootPath, 'builds')

  function getStagingBuildPath(buildId: string) {
    return join(stagingRootPath, buildId)
  }

  function getPromotedBuildPath(buildId: string) {
    return join(promotedRootPath, buildId)
  }

  return {
    getPromotedBuildPath,
    getStagingBuildPath,
    async promote({ buildId }) {
      const stagingPath = getStagingBuildPath(buildId)
      const promotedPath = getPromotedBuildPath(buildId)
      const temporaryPath = `${promotedPath}.tmp`

      try {
        await access(stagingPath)
      } catch {
        throw new MissingStagedPublicBuildError(buildId)
      }

      await mkdir(promotedRootPath, { recursive: true })
      await rm(temporaryPath, { recursive: true, force: true })
      await rm(promotedPath, { recursive: true, force: true })
      await cp(stagingPath, temporaryPath, { recursive: true, force: true })
      await rename(temporaryPath, promotedPath)

      return promotedPath
    },
  }
}
