import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { parseDocFile, serializeDocFile } from '../../src/features/docs/content/doc-source'
import type { DocPage, TranslationStatus } from '../../src/features/docs/lib/docs-engine'
import { createContentPathService, type ContentPathService } from './content-paths'

const saveDraftSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  locale: z.string().trim().min(1),
  version: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/),
  section: z.string().trim().min(1),
  order: z.number().int().nonnegative().default(999),
  tags: z.array(z.string().trim().min(1)).default([]),
  body: z.string().trim().min(1),
  translationKey: z.string().trim().min(1),
  translationStatus: z.enum(['current', 'missing', 'outdated']),
  expectedUpdatedAt: z.string().trim().min(1).optional(),
})

export type DraftSaveInput = z.infer<typeof saveDraftSchema>

export class InvalidDraftInputError extends Error {
  constructor(message = 'Invalid draft input') {
    super(message)
    this.name = 'InvalidDraftInputError'
  }
}

export class InvalidDraftContentError extends Error {
  constructor(message = 'Draft content is invalid') {
    super(message)
    this.name = 'InvalidDraftContentError'
  }
}

export class DraftConflictError extends Error {
  constructor(message = 'Draft has changed since it was loaded') {
    super(message)
    this.name = 'DraftConflictError'
  }
}

export interface DraftRepository {
  getDraft: (locale: string, version: string, slug: string) => Promise<DocPage | undefined>
  listDrafts: () => Promise<DocPage[]>
  saveDraft: (draft: DraftSaveInput) => Promise<DocPage>
}

async function collectDraftFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return []
    }

    throw error
  })

  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(rootPath, entry.name)

      if (entry.isDirectory()) {
        return collectDraftFiles(absolutePath)
      }

      return absolutePath.endsWith('.mdx') ? [absolutePath] : []
    }),
  )

  return files.flat()
}

function sortDrafts(pages: DocPage[]): DocPage[] {
  return [...pages].sort(
    (left, right) =>
      left.locale.localeCompare(right.locale) ||
      left.version.localeCompare(right.version) ||
      left.slug.localeCompare(right.slug),
  )
}

function parseSavedDraft(
  contentPaths: ContentPathService,
  absolutePath: string,
  source: string,
  updatedAt: string,
): DocPage {
  try {
    const canonicalPath = contentPaths.getCanonicalPathFromAbsolute(absolutePath)
    return {
      ...parseDocFile(canonicalPath, source).page,
      updatedAt,
    }
  } catch {
    throw new InvalidDraftContentError()
  }
}

async function readDraftRevision(absolutePath: string) {
  const fileStat = await stat(absolutePath)
  return fileStat.mtime.toISOString()
}

export function createDraftRepository(options: {
  contentPathService?: ContentPathService
  contentRootPath?: string
} = {}): DraftRepository {
  const contentPaths =
    options.contentPathService ?? createContentPathService({ contentRootPath: options.contentRootPath })

  return {
    async getDraft(locale, version, slug) {
      const draftLocation = contentPaths.resolveDraftLocation({ locale, version, slug })

      const source = await readFile(draftLocation.absolutePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined
        }

        throw error
      })

      if (!source) {
        return undefined
      }

      return parseSavedDraft(
        contentPaths,
        draftLocation.absolutePath,
        source,
        await readDraftRevision(draftLocation.absolutePath),
      )
    },
    async listDrafts() {
      const files = await collectDraftFiles(contentPaths.draftsRootPath)
      const drafts = await Promise.all(
        files.map(async (absolutePath) => {
          const source = await readFile(absolutePath, 'utf8')
          return parseSavedDraft(contentPaths, absolutePath, source, await readDraftRevision(absolutePath))
        }),
      )

      return sortDrafts(drafts)
    },
    async saveDraft(draft) {
      const parsedDraft = saveDraftSchema.safeParse(draft)

      if (!parsedDraft.success) {
        throw new InvalidDraftInputError()
      }

      const draftLocation = contentPaths.resolveDraftLocation(parsedDraft.data)
      const existingDraft = await this.getDraft(parsedDraft.data.locale, parsedDraft.data.version, parsedDraft.data.slug)

      if (
        parsedDraft.data.expectedUpdatedAt &&
        existingDraft &&
        existingDraft.updatedAt !== parsedDraft.data.expectedUpdatedAt
      ) {
        throw new DraftConflictError()
      }

      const serialized = serializeDocFile({
        title: parsedDraft.data.title,
        summary: parsedDraft.data.summary,
        slug: parsedDraft.data.slug,
        section: parsedDraft.data.section,
        order: parsedDraft.data.order,
        tags: parsedDraft.data.tags,
        translationKey: parsedDraft.data.translationKey,
        translationStatus: parsedDraft.data.translationStatus as TranslationStatus,
        status: 'draft',
        body: parsedDraft.data.body,
      })

      await mkdir(dirname(draftLocation.absolutePath), { recursive: true })
      await writeFile(draftLocation.absolutePath, serialized, 'utf8')

      return parseSavedDraft(
        contentPaths,
        draftLocation.absolutePath,
        serialized,
        await readDraftRevision(draftLocation.absolutePath),
      )
    },
  }
}
