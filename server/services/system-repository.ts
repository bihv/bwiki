import { readFile } from 'node:fs/promises'

import { z } from 'zod'

import type { PublishRecord, RedirectRule, SiteConfig } from '../../src/features/docs/lib/docs-engine'
import { createContentPathService, type ContentPathService } from './content-paths'

export interface BuildState {
  status: string
  currentBuildId: string | null
  lastSuccessfulBuildId: string | null
  queuedAt: string | null
  updatedAt: string | null
  error: string | null
}

export interface MediaAsset {
  id: string
  title: string
  url: string
  kind: 'image' | 'video' | 'file'
}

export interface SystemRepository {
  getBuildState: () => Promise<BuildState>
  getMedia: () => Promise<MediaAsset[]>
  getPublishHistory: () => Promise<PublishRecord[]>
  getRedirects: () => Promise<RedirectRule[]>
  getSiteConfig: () => Promise<SiteConfig>
}

const redirectRuleSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  locale: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
})

const siteConfigSchema = z.object({
  locales: z.array(
    z.object({
      key: z.string().trim().min(1),
      label: z.string().trim().min(1),
      isDefault: z.boolean().optional(),
    }),
  ),
  versions: z.array(
    z.object({
      key: z.string().trim().min(1),
      label: z.string().trim().min(1),
      isDeprecated: z.boolean().optional(),
      isLatest: z.boolean().optional(),
      isStable: z.boolean().optional(),
    }),
  ),
  componentRegistry: z.array(z.string().trim().min(1)),
  redirects: z.array(redirectRuleSchema),
})

const mediaAssetSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  kind: z.enum(['image', 'video', 'file']),
})

const publishRecordSchema = z.object({
  actor: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
  role: z.enum(['admin', 'editor']),
  locale: z.string().trim().min(1),
  version: z.string().trim().min(1),
  targetSlug: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  result: z.enum(['published']),
})

const buildStateSchema = z.object({
  status: z.string().trim().min(1),
  currentBuildId: z.string().nullable(),
  lastSuccessfulBuildId: z.string().nullable(),
  queuedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  error: z.string().nullable(),
})

export class InvalidSystemDataError extends Error {
  constructor(message = 'System data is invalid') {
    super(message)
    this.name = 'InvalidSystemDataError'
  }
}

async function readJsonFile<T>(absolutePath: string, schema: z.ZodType<T>): Promise<T> {
  let rawValue: unknown

  try {
    rawValue = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown
  } catch {
    throw new InvalidSystemDataError()
  }

  const parsed = schema.safeParse(rawValue)
  if (!parsed.success) {
    throw new InvalidSystemDataError()
  }

  return parsed.data
}

export function createSystemRepository(options: {
  contentPathService?: ContentPathService
  contentRootPath?: string
} = {}): SystemRepository {
  const contentPaths =
    options.contentPathService ?? createContentPathService({ contentRootPath: options.contentRootPath })

  return {
    getBuildState() {
      return readJsonFile(contentPaths.getSystemFilePath('build-state.json'), buildStateSchema)
    },
    getMedia() {
      return readJsonFile(contentPaths.getSystemFilePath('media.json'), z.array(mediaAssetSchema))
    },
    getPublishHistory() {
      return readJsonFile(contentPaths.getSystemFilePath('publish-history.json'), z.array(publishRecordSchema))
    },
    getRedirects() {
      return readJsonFile(contentPaths.getSystemFilePath('redirects.json'), z.array(redirectRuleSchema))
    },
    getSiteConfig() {
      return readJsonFile(contentPaths.getSystemFilePath('site-config.json'), siteConfigSchema)
    },
  }
}
