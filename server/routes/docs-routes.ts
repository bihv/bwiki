import { Router, type Response } from 'express'
import { z, ZodError } from 'zod'

import type { DraftRepository } from '../services/draft-repository'
import type { PublishService } from '../services/publish-service'
import type { SystemRepository } from '../services/system-repository'

const safeSingleSegmentSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^(?!\.{1,2}$)[A-Za-z0-9._-]+$/, 'must be a single safe path segment')

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/, 'Slug must use lowercase path segments')

const draftParamsSchema = z.object({
  locale: safeSingleSegmentSchema,
  version: safeSingleSegmentSchema,
  slug: slugSchema,
})

const saveDraftBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  summary: z.string().trim().min(1, 'Summary is required'),
  section: z.string().trim().min(1, 'Section is required'),
  order: z.number().int().nonnegative('Order must be zero or greater').default(999),
  tags: z.array(z.string().trim().min(1, 'Tags cannot be empty')).default([]),
  body: z.string().trim().min(1, 'Body is required'),
  translationKey: z.string().trim().min(1, 'Translation key is required'),
  translationStatus: z.enum(['current', 'missing', 'outdated']),
  expectedUpdatedAt: z.string().trim().min(1).optional(),
})

const publishBodySchema = z.object({
  expectedUpdatedAt: z.string().trim().min(1).optional(),
  actor: z.object({
    id: z.string().trim().min(1, 'Actor id is required'),
    name: z.string().trim().min(1, 'Actor name is required'),
    role: z.enum(['admin', 'editor']),
  }),
})

function getSlugParam(rawSlug: string | string[] | undefined): string {
  if (Array.isArray(rawSlug)) {
    return rawSlug.join('/')
  }

  return rawSlug ?? ''
}

function sendZodError(error: ZodError, response: Response) {
  return response.status(400).json({
    error: 'Invalid request',
    issues: error.issues.map((issue) => {
      if (issue.path[0] === 'locale') {
        return `Locale ${issue.message}`
      }

      if (issue.path[0] === 'version') {
        return `Version ${issue.message}`
      }

      return issue.message
    }),
  })
}

function parseDraftParams(rawParams: { locale?: string; version?: string; slug?: string | string[] }) {
  return draftParamsSchema.parse({
    locale: rawParams.locale ?? '',
    version: rawParams.version ?? '',
    slug: getSlugParam(rawParams.slug),
  })
}

export function createDocsRouter(input: {
  draftRepository: DraftRepository
  publishService: PublishService
  systemRepository: SystemRepository
}) {
  const router = Router()

  router.get('/drafts', async (_request, response, next) => {
    try {
      response.json({ drafts: await input.draftRepository.listDrafts() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/pages', async (_request, response, next) => {
    try {
      response.json({ pages: await input.publishService.getPublishedPages() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/drafts/:locale/:version/*slug', async (request, response, next) => {
    try {
      const params = parseDraftParams(request.params)
      const draft = await input.draftRepository.getDraft(params.locale, params.version, params.slug)

      if (!draft) {
        response.status(404).json({ error: 'Draft not found' })
        return
      }

      response.json({ draft })
    } catch (error) {
      next(error)
    }
  })

  router.put('/drafts/:locale/:version/*slug', async (request, response, next) => {
    try {
      const params = parseDraftParams(request.params)
      const payload = saveDraftBodySchema.parse(request.body)
      const draft = await input.draftRepository.saveDraft({
        ...payload,
        locale: params.locale,
        version: params.version,
        slug: params.slug,
      })

      response.json({ draft })
    } catch (error) {
      if (error instanceof ZodError) {
        sendZodError(error, response)
        return
      }

      next(error)
    }
  })

  router.get('/system/build-state', async (_request, response, next) => {
    try {
      response.json({ buildState: await input.publishService.getStatus() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/media', async (_request, response, next) => {
    try {
      response.json({ media: await input.systemRepository.getMedia() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/publish-history', async (_request, response, next) => {
    try {
      response.json({ publishHistory: await input.publishService.getPublishHistory() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/redirects', async (_request, response, next) => {
    try {
      response.json({ redirects: await input.systemRepository.getRedirects() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/site-config', async (_request, response, next) => {
    try {
      response.json({ siteConfig: await input.systemRepository.getSiteConfig() })
    } catch (error) {
      next(error)
    }
  })

  router.post('/publish/:locale/:version/*slug', async (request, response, next) => {
    try {
      const params = parseDraftParams(request.params)
      const body = publishBodySchema.parse(request.body)

      response.status(202).json(
        await input.publishService.publish({
          locale: params.locale,
          version: params.version,
          slug: params.slug,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actor: body.actor,
        }),
      )
    } catch (error) {
      if (error instanceof ZodError) {
        sendZodError(error, response)
        return
      }

      next(error)
    }
  })

  router.get('/publish-status', async (_request, response, next) => {
    try {
      response.json(await input.publishService.getStatus())
    } catch (error) {
      next(error)
    }
  })

  return router
}
