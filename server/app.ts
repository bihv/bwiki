import { access } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

import express, { type NextFunction, type Request, type Response } from 'express'
import { ZodError } from 'zod'

import { createDocsRouter } from './routes/docs-routes'
import { createContentPathService } from './services/content-paths'
import { InvalidContentPathError } from './services/content-paths'
import {
  createDraftRepository,
  DraftConflictError,
  InvalidDraftContentError,
  InvalidDraftInputError,
} from './services/draft-repository'
import {
  CorruptedSystemFileError,
  DraftNotFoundError,
  PublishValidationError,
  createPublishService,
} from './services/publish-service'
import { createPublicBuildRepository } from './services/public-build-repository'
import { createSystemRepository, InvalidSystemDataError } from './services/system-repository'

function isMalformedJsonBodyError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'body' in error
  )
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function createDocsApp(options: { contentRootPath?: string; runtimeRootPath?: string } = {}) {
  const contentPathService = createContentPathService({ contentRootPath: options.contentRootPath })
  const draftRepository = createDraftRepository({ contentPathService })
  const publishService = createPublishService({
    contentPathService,
    runtimeRootPath: options.runtimeRootPath,
  })
  const systemRepository = createSystemRepository({ contentPathService })
  const publicBuildRepository = createPublicBuildRepository({ runtimeRootPath: options.runtimeRootPath })
  const fallbackBuildPath = resolve(contentPathService.contentRootPath, '..', 'dist')
  const app = express()

  app.use(express.json())
  app.use('/api/docs', createDocsRouter({ draftRepository, publishService, systemRepository }))
  app.use(async (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method) || /^\/api(?:\/|$)/.test(request.path)) {
      next()
      return
    }

    try {
      const status = await publishService.getStatus()
      const buildId = status.currentBuildId ?? status.lastSuccessfulBuildId
      const buildPath = buildId
        ? publicBuildRepository.getPromotedBuildPath(buildId)
        : (await pathExists(fallbackBuildPath))
          ? fallbackBuildPath
          : null

      if (!buildPath) {
        next()
        return
      }
      const staticMiddleware = express.static(buildPath, {
        fallthrough: true,
        index: 'index.html',
      })

      staticMiddleware(request, response, (error) => {
        if (error) {
          next(error)
          return
        }

        if (response.headersSent) {
          return
        }

        if (extname(request.path)) {
          next()
          return
        }

        response.sendFile(join(buildPath, 'index.html'), (sendError) => {
          const errorCode = sendError && 'code' in sendError ? sendError.code : undefined

          if (!sendError || errorCode === 'ENOENT') {
            next()
            return
          }

          next(sendError)
        })
      })
    } catch (error) {
      next(error)
    }
  })
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (isMalformedJsonBodyError(error)) {
      response.status(400).json({
        error: 'Malformed JSON body',
      })
      return
    }

    if (error instanceof ZodError) {
      response.status(400).json({
        error: 'Invalid request',
        issues: error.issues.map((issue) => issue.message),
      })
      return
    }

    if (error instanceof InvalidContentPathError || error instanceof InvalidDraftInputError) {
      response.status(400).json({
        error: 'Invalid request',
      })
      return
    }

    if (error instanceof DraftConflictError) {
      response.status(409).json({
        error: 'Draft has changed since it was loaded',
      })
      return
    }

    if (error instanceof InvalidDraftContentError) {
      response.status(422).json({
        error: 'Draft content is invalid',
      })
      return
    }

    if (error instanceof DraftNotFoundError) {
      response.status(404).json({
        error: 'Draft not found',
      })
      return
    }

    if (error instanceof PublishValidationError) {
      response.status(422).json({
        error: 'Publish validation failed',
        issues: error.issues,
      })
      return
    }

    if (error instanceof InvalidSystemDataError || error instanceof CorruptedSystemFileError) {
      response.status(422).json({
        error: 'System data is invalid',
      })
      return
    }

    response.status(500).json({
      error: 'Internal server error',
    })
  })

  return app
}
