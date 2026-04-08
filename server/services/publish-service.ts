import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import { build as viteBuild } from 'vite'
import { z } from 'zod'

import { parseDocFile, serializeDocFile } from '../../src/features/docs/content/doc-source'
import {
  type DocPage,
  type DraftDocInput,
  type PublishActor,
  type PublishRecord,
  validateDraft,
} from '../../src/features/docs/lib/docs-engine'
import { generateDocsArtifacts } from '../../scripts/docs/generate-docs-artifacts'
import { DraftConflictError } from './draft-repository'
import type { BuildState } from './system-repository'
import { createBuildQueue, type BuildQueue } from './build-queue'
import { createContentPathService, type ContentPathService } from './content-paths'
import { createPublicBuildRepository, type PublicBuildRepository } from './public-build-repository'

const publishRequestSchema = z.object({
  locale: z.string().trim().min(1),
  version: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  expectedUpdatedAt: z.string().trim().min(1).optional(),
  actor: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    role: z.enum(['admin', 'editor']),
  }),
})

const buildStateSchema = z.object({
  status: z.string().trim().min(1),
  currentBuildId: z.string().nullable(),
  lastSuccessfulBuildId: z.string().nullable(),
  queuedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  error: z.string().nullable(),
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
  redirects: z.array(
    z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
      locale: z.string().trim().min(1).optional(),
      version: z.string().trim().min(1).optional(),
    }),
  ),
})

const publishHistorySchema = z.array(
  z.object({
    actor: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
    role: z.enum(['admin', 'editor']),
    locale: z.string().trim().min(1),
    version: z.string().trim().min(1),
    targetSlug: z.string().trim().min(1),
    timestamp: z.string().trim().min(1),
    result: z.enum(['published']),
  }),
)

const DEFAULT_BUILD_STATE: BuildState = {
  status: 'idle',
  currentBuildId: null,
  lastSuccessfulBuildId: null,
  queuedAt: null,
  updatedAt: null,
  error: null,
}

const WORKSPACE_COPY_TARGETS = ['index.html', 'package.json', 'package-lock.json', 'public', 'scripts', 'src', 'tsconfig.json', 'vite.config.ts']

interface FileSnapshot {
  contents?: string
  exists: boolean
}

export class DraftNotFoundError extends Error {
  constructor(locale: string, version: string, slug: string) {
    super(`Draft not found for ${locale}/${version}/${slug}`)
    this.name = 'DraftNotFoundError'
  }
}

export class PublishValidationError extends Error {
  issues: string[]

  constructor(issues: string[]) {
    super('Publish validation failed')
    this.name = 'PublishValidationError'
    this.issues = issues
  }
}

export class CorruptedSystemFileError extends Error {
  absolutePath: string
  reason: 'read' | 'parse' | 'validate'
  code?: string

  constructor(
    absolutePath: string,
    reason: 'read' | 'parse' | 'validate',
    options: { code?: string; cause?: unknown } = {},
  ) {
    const action =
      reason === 'read'
        ? 'could not be read'
        : reason === 'parse'
          ? 'contains invalid JSON'
          : 'failed schema validation'

    super(`System file "${basename(absolutePath)}" ${action}`)
    if (options.cause) {
      this.cause = options.cause
    }
    this.name = 'CorruptedSystemFileError'
    this.absolutePath = absolutePath
    this.reason = reason
    this.code = options.code
  }
}

export interface PublishRequest {
  actor: PublishActor
  expectedUpdatedAt?: string
  locale: string
  slug: string
  version: string
}

export interface PublishService {
  getStatus: () => Promise<BuildState>
  getPublishHistory: () => Promise<PublishRecord[]>
  publish: (request: PublishRequest) => Promise<{ status: 'queued' }>
  waitForIdle: () => Promise<void>
}

export interface RunPublicBuildInput {
  outDir: string
  workspaceRoot: string
}

interface LoadedDraft {
  draftInput: DraftDocInput & { order: number }
  parsedDraft: ReturnType<typeof parseDocFile>['page']
}

export interface PublishServiceOptions {
  buildQueue?: BuildQueue
  contentPathService?: ContentPathService
  contentRootPath?: string
  createBuildId?: () => string
  now?: () => string
  projectRootPath?: string
  publicBuildRepository?: PublicBuildRepository
  runPublicBuild?: (input: RunPublicBuildInput) => Promise<void>
  runtimeRootPath?: string
  writePublishedSource?: (input: { destinationPath: string; source: string }) => Promise<void>
  writeBuildStateFile?: (input: { absolutePath: string; state: BuildState }) => Promise<void>
  writePublishHistoryFile?: (input: { absolutePath: string; records: PublishRecord[] }) => Promise<void>
  onSystemRead?: (file: 'build-state' | 'publish-history') => Promise<void> | void
}

function createDefaultBuildId() {
  return `build-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

function toDraftInput(page: DocPage): DraftDocInput & { order: number } {
  return {
    title: page.title,
    summary: page.summary,
    locale: page.locale,
    version: page.version,
    slug: page.slug,
    section: page.section,
    order: page.order,
    tags: page.tags,
    body: page.body,
    translationKey: page.translationKey,
    translationStatus: page.translationStatus,
  }
}

function toPublishedSource(draft: DraftDocInput & { order: number }) {
  return serializeDocFile({
    title: draft.title,
    summary: draft.summary,
    slug: draft.slug,
    section: draft.section,
    order: draft.order,
    tags: draft.tags,
    translationKey: draft.translationKey,
    translationStatus: draft.translationStatus,
    status: 'published',
    body: draft.body,
  })
}

function getPublishedDocAbsolutePath(contentRootPath: string, draft: { locale: string; version: string; slug: string }) {
  return resolve(contentRootPath, 'docs', draft.version, draft.locale, `${draft.slug}.mdx`)
}

function sortPublishedPages(pages: DocPage[]) {
  return [...pages].sort(
    (left, right) =>
      left.locale.localeCompare(right.locale) ||
      left.version.localeCompare(right.version) ||
      left.slug.localeCompare(right.slug),
  )
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function getFileUpdatedAt(absolutePath: string) {
  const fileStat = await stat(absolutePath)
  return fileStat.mtime.toISOString()
}

async function collectMdxFiles(rootPath: string): Promise<string[]> {
  const exists = await pathExists(rootPath)
  if (!exists) {
    return []
  }

  const entries = await readdir(rootPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        return collectMdxFiles(absolutePath)
      }

      return absolutePath.endsWith('.mdx') ? [absolutePath] : []
    }),
  )

  return files.flat()
}

async function ensureDirectoryPath(directoryPath: string) {
  const parentPath = dirname(directoryPath)

  if (parentPath !== directoryPath) {
    await ensureDirectoryPath(parentPath)
  }

  try {
    const directoryStat = await stat(directoryPath)
    if (directoryStat.isDirectory()) {
      return
    }

    await rm(directoryPath, { recursive: true, force: true })
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }

  await mkdir(directoryPath, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error
    }
  })
}

async function readJsonFile<T>(
  absolutePath: string,
  schema: z.ZodType<T>,
  options: { allowMissing?: boolean; fallback?: T } = {},
): Promise<T> {
  let source: string

  try {
    source = await readFile(absolutePath, 'utf8')
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT' && options.allowMissing) {
      return options.fallback as T
    }

    throw new CorruptedSystemFileError(absolutePath, 'read', { code: nodeError.code, cause: error })
  }

  let rawValue: unknown

  try {
    rawValue = JSON.parse(source) as unknown
  } catch {
    throw new CorruptedSystemFileError(absolutePath, 'parse', { cause: new Error('Invalid JSON') })
  }

  const parsed = schema.safeParse(rawValue)
  if (!parsed.success) {
    throw new CorruptedSystemFileError(absolutePath, 'validate')
  }

  return parsed.data
}

async function bootstrapJsonFile<T>(absolutePath: string, schema: z.ZodType<T>, initialValue: T) {
  try {
    await readJsonFile(absolutePath, schema)
  } catch (error) {
    if (error instanceof CorruptedSystemFileError && error.reason === 'read' && error.code === 'ENOENT') {
      await writeJsonFile(absolutePath, initialValue)
      return
    }

    throw error
  }
}

async function writeTextFileAtomically(absolutePath: string, contents: string) {
  const directoryPath = dirname(absolutePath)
  const uniqueSuffix = `${process.pid}.${Date.now()}.${randomUUID()}`
  const temporaryPath = join(directoryPath, `.${basename(absolutePath)}.${uniqueSuffix}.tmp`)
  const backupPath = join(directoryPath, `.${basename(absolutePath)}.${uniqueSuffix}.bak`)

  await ensureDirectoryPath(directoryPath)

  await writeFile(temporaryPath, contents, 'utf8')

  let backupCreated = false

  try {
    try {
      await rename(absolutePath, backupPath)
      backupCreated = true
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT') {
        throw error
      }
    }

    await rename(temporaryPath, absolutePath)

    if (backupCreated) {
      await rm(backupPath, { force: true })
    }
  } catch (error) {
    if (backupCreated) {
      await rename(backupPath, absolutePath).catch(() => undefined)
    }

    throw error
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    await rm(backupPath, { force: true }).catch(() => undefined)
  }
}

async function writeJsonFile(absolutePath: string, value: unknown) {
  await writeTextFileAtomically(absolutePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function captureFileSnapshot(absolutePath: string): Promise<FileSnapshot> {
  try {
    return {
      exists: true,
      contents: await readFile(absolutePath, 'utf8'),
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return {
        exists: false,
      }
    }

    throw error
  }
}

async function restoreFileSnapshot(absolutePath: string, snapshot: FileSnapshot) {
  if (!snapshot.exists) {
    await rm(absolutePath, { recursive: true, force: true })
    return
  }

  await writeTextFileAtomically(absolutePath, snapshot.contents ?? '')
}

async function copyWorkspace(projectRootPath: string, workspaceRoot: string, contentRootPath: string) {
  await rm(workspaceRoot, { recursive: true, force: true })
  await mkdir(workspaceRoot, { recursive: true })

  await Promise.all(
    WORKSPACE_COPY_TARGETS.map(async (targetPath) => {
      const sourcePath = join(projectRootPath, targetPath)
      if (!(await pathExists(sourcePath))) {
        return
      }

      await cp(sourcePath, join(workspaceRoot, targetPath), { recursive: true, force: true })
    }),
  )

  await cp(contentRootPath, join(workspaceRoot, 'content'), { recursive: true, force: true })
}

async function loadPublishedPages(contentRootPath: string): Promise<DocPage[]> {
  const docsRootPath = join(contentRootPath, 'docs')
  const files = await collectMdxFiles(docsRootPath)
  const pages = await Promise.all(
    files.map(async (absolutePath) => {
      const relativePath = relative(contentRootPath, absolutePath).replace(/\\/g, '/')
      return parseDocFile(`content/${relativePath}`, await readFile(absolutePath, 'utf8')).page
    }),
  )

  return sortPublishedPages(pages.filter((page) => page.status === 'published'))
}

async function defaultRunPublicBuild({ outDir, workspaceRoot }: RunPublicBuildInput) {
  await rm(outDir, { recursive: true, force: true })
  await viteBuild({
    configFile: join(workspaceRoot, 'vite.config.ts'),
    root: workspaceRoot,
    build: {
      outDir,
      emptyOutDir: true,
    },
  })
}

export function createPublishService(options: PublishServiceOptions = {}): PublishService {
  const projectRootPath = resolve(options.projectRootPath ?? '.')
  const runtimeRootPath = resolve(options.runtimeRootPath ?? join(projectRootPath, '.runtime'))
  const contentPathService =
    options.contentPathService ?? createContentPathService({ contentRootPath: options.contentRootPath })
  const contentRootPath = contentPathService.contentRootPath
  const publicBuildRepository =
    options.publicBuildRepository ?? createPublicBuildRepository({ runtimeRootPath })
  const createBuildId = options.createBuildId ?? createDefaultBuildId
  const now = options.now ?? (() => new Date().toISOString())
  const runPublicBuild = options.runPublicBuild ?? defaultRunPublicBuild
  const writePublishedSource =
    options.writePublishedSource ??
    (async (input: { destinationPath: string; source: string }) => {
      await writeTextFileAtomically(input.destinationPath, input.source)
    })

  const buildStatePath = contentPathService.getSystemFilePath('build-state.json')
  const publishHistoryPath = contentPathService.getSystemFilePath('publish-history.json')
  const siteConfigPath = contentPathService.getSystemFilePath('site-config.json')
  let systemFileTaskChain: Promise<unknown> = Promise.resolve()

  function queueSystemFileTask<T>(task: () => Promise<T>) {
    const nextTask = systemFileTaskChain.catch(() => undefined).then(task)
    systemFileTaskChain = nextTask.then(
      () => undefined,
      () => undefined,
    )
    return nextTask
  }

  async function bootstrapSystemFiles() {
    await ensureDirectoryPath(dirname(buildStatePath))
    await ensureDirectoryPath(dirname(publishHistoryPath))

    await queueSystemFileTask(async () => {
      await bootstrapJsonFile(buildStatePath, buildStateSchema, DEFAULT_BUILD_STATE)
      await bootstrapJsonFile(publishHistoryPath, publishHistorySchema, [])
    })
  }

  async function readBuildState() {
    return readJsonFile(buildStatePath, buildStateSchema)
  }

  async function writeBuildState(nextState: BuildState) {
    if (options.writeBuildStateFile) {
      await options.writeBuildStateFile({ absolutePath: buildStatePath, state: nextState })
      return
    }

    await writeJsonFile(buildStatePath, nextState)
  }

  async function updateBuildState(mutator: (state: BuildState) => BuildState) {
    return queueSystemFileTask(async () => {
      const currentState = await readBuildState()
      const nextState = mutator(currentState)
      await writeBuildState(nextState)
      return nextState
    })
  }

  async function readSiteConfig() {
    return readJsonFile(siteConfigPath, siteConfigSchema)
  }

  async function readPublishHistory() {
    return readJsonFile(publishHistoryPath, publishHistorySchema)
  }

  async function loadDraft(input: { locale: string; version: string; slug: string }): Promise<LoadedDraft> {
    const draftLocation = contentPathService.resolveDraftLocation(input)
    const exists = await pathExists(draftLocation.absolutePath)

    if (!exists) {
      throw new DraftNotFoundError(input.locale, input.version, input.slug)
    }

    const source = await readFile(draftLocation.absolutePath, 'utf8')
    const parsedDraft = {
      ...parseDocFile(draftLocation.canonicalPath, source).page,
      updatedAt: await getFileUpdatedAt(draftLocation.absolutePath),
    }

    return {
      draftInput: toDraftInput(parsedDraft),
      parsedDraft,
    }
  }

  async function validatePublishRequest(input: PublishRequest) {
    const parsedRequest = publishRequestSchema.parse(input)
    const loadedDraft = await loadDraft(parsedRequest)
    if (
      parsedRequest.expectedUpdatedAt &&
      loadedDraft.parsedDraft.updatedAt !== parsedRequest.expectedUpdatedAt
    ) {
      throw new DraftConflictError()
    }
    const siteConfig = await readSiteConfig()
    const publishedPages = await loadPublishedPages(contentRootPath)
    const validationIssues: string[] = []

    if (!siteConfig.locales.some((locale) => locale.key === parsedRequest.locale)) {
      validationIssues.push(`Unknown locale: ${parsedRequest.locale}`)
    }

    if (!siteConfig.versions.some((version) => version.key === parsedRequest.version)) {
      validationIssues.push(`Unknown version: ${parsedRequest.version}`)
    }

    const stagedPages = publishedPages.filter(
      (page) =>
        !(
          page.locale === loadedDraft.draftInput.locale &&
          page.version === loadedDraft.draftInput.version &&
          page.slug === loadedDraft.draftInput.slug
        ),
    )

    stagedPages.push({
      ...loadedDraft.parsedDraft,
      status: 'published',
      sourcePath: `content/docs/${loadedDraft.draftInput.version}/${loadedDraft.draftInput.locale}/${loadedDraft.draftInput.slug}.mdx`,
    })

    const validation = validateDraft(loadedDraft.draftInput, stagedPages, siteConfig)
    validationIssues.push(...validation.errors)

    if (validationIssues.length > 0) {
      throw new PublishValidationError(validationIssues)
    }

    return {
      draft: loadedDraft.draftInput,
      request: parsedRequest,
    }
  }

  async function appendPublishRecord(record: PublishRecord) {
    await queueSystemFileTask(async () => {
      const publishHistory = await readPublishHistory()
      const nextHistory = [record, ...publishHistory]

      if (options.writePublishHistoryFile) {
        await options.writePublishHistoryFile({ absolutePath: publishHistoryPath, records: nextHistory })
        return
      }

      await writeJsonFile(publishHistoryPath, nextHistory)
    })
  }

  async function promotePublishedSource(draft: DraftDocInput & { order: number }) {
    const destinationPath = getPublishedDocAbsolutePath(contentRootPath, draft)
    await writePublishedSource({
      destinationPath,
      source: toPublishedSource(draft),
    })
  }

  async function restoreLiveSnapshot(input: {
    buildId: string
    buildStateSnapshot: FileSnapshot
    publishHistorySnapshot: FileSnapshot
    publishedSourcePath: string
    publishedSourceSnapshot: FileSnapshot
  }) {
    await rm(publicBuildRepository.getPromotedBuildPath(input.buildId), { recursive: true, force: true })
    await restoreFileSnapshot(input.publishedSourcePath, input.publishedSourceSnapshot)
    await queueSystemFileTask(async () => {
      await restoreFileSnapshot(publishHistoryPath, input.publishHistorySnapshot)
      await restoreFileSnapshot(buildStatePath, input.buildStateSnapshot)
    })
  }

  async function executePublish(
    validated: Awaited<ReturnType<typeof validatePublishRequest>>,
    queueMeta: { pendingJobsAfterCurrent: () => number } = { pendingJobsAfterCurrent: () => 0 },
  ) {
    const buildId = createBuildId()
    const workspaceRoot = join(runtimeRootPath, 'workspaces', buildId)
    const stagedBuildPath = publicBuildRepository.getStagingBuildPath(buildId)
    const stagedPublishedDocPath = getPublishedDocAbsolutePath(join(workspaceRoot, 'content'), validated.draft)
    const livePublishedDocPath = getPublishedDocAbsolutePath(contentRootPath, validated.draft)
    const publishTimestamp = now()
    const buildStateSnapshotValue = await readBuildState()
    const buildStateSnapshot = await captureFileSnapshot(buildStatePath)
    const publishHistorySnapshot = await captureFileSnapshot(publishHistoryPath)
    const publishedSourceSnapshot = await captureFileSnapshot(livePublishedDocPath)
    let liveCommitStarted = false

    try {
      await copyWorkspace(projectRootPath, workspaceRoot, contentRootPath)
      await ensureDirectoryPath(dirname(stagedPublishedDocPath))
      await writeFile(stagedPublishedDocPath, toPublishedSource(validated.draft), 'utf8')

      await generateDocsArtifacts({ cwd: workspaceRoot })
      await runPublicBuild({
        workspaceRoot,
        outDir: stagedBuildPath,
      })
      liveCommitStarted = true
      await publicBuildRepository.promote({ buildId })
      await promotePublishedSource(validated.draft)
      await appendPublishRecord({
        actor: validated.request.actor.name,
        actorId: validated.request.actor.id,
        role: validated.request.actor.role,
        locale: validated.request.locale,
        version: validated.request.version,
        targetSlug: validated.request.slug,
        timestamp: publishTimestamp,
        result: 'published',
      })

      await queueSystemFileTask(async () => {
        const remainingJobs = queueMeta.pendingJobsAfterCurrent()
        await writeBuildState({
          ...buildStateSnapshotValue,
          status: remainingJobs > 0 ? 'queued' : 'ready',
          currentBuildId: buildId,
          lastSuccessfulBuildId: buildId,
          queuedAt: remainingJobs > 0 ? publishTimestamp : null,
          updatedAt: publishTimestamp,
          error: null,
        })
      })
    } catch (error) {
      const failureError = error instanceof Error ? error : new Error('Unknown publish failure')
      if (liveCommitStarted) {
        await restoreLiveSnapshot({
          buildId,
          buildStateSnapshot,
          publishHistorySnapshot,
          publishedSourcePath: livePublishedDocPath,
          publishedSourceSnapshot,
        })
      }

      try {
        await updateBuildState(() => ({
          ...buildStateSnapshotValue,
          status: 'failed',
          queuedAt: null,
          updatedAt: now(),
          error: failureError.message,
        }))
      } catch {
        // preserve original failure meaning even if failed-state persistence also fails
      }

      throw failureError
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
      await rm(stagedBuildPath, { recursive: true, force: true })
    }
  }

  const bootstrapPromise = bootstrapSystemFiles()

  const buildQueue =
    options.buildQueue ??
    createBuildQueue({
      onQueued: async ({ isBuilding }) => {
        await bootstrapPromise
        await updateBuildState((state) => ({
          ...state,
          status: isBuilding ? state.status : 'queued',
          queuedAt: now(),
          updatedAt: now(),
          error: isBuilding ? state.error : null,
        }))
      },
      onBuilding: async () => {
        await bootstrapPromise
        await updateBuildState((state) => ({
          ...state,
          status: 'building',
          updatedAt: now(),
          error: null,
        }))
      },
    })

  return {
    async getStatus() {
      await bootstrapPromise
      return queueSystemFileTask(async () => {
        await options.onSystemRead?.('build-state')
        return readBuildState()
      })
    },
    async getPublishHistory() {
      await bootstrapPromise
      return queueSystemFileTask(async () => {
        await options.onSystemRead?.('publish-history')
        return readPublishHistory()
      })
    },
    async publish(request) {
      await bootstrapPromise
      const validated = await validatePublishRequest(request)
      return buildQueue.enqueue(({ pendingJobsAfterCurrent }) =>
        executePublish(validated, { pendingJobsAfterCurrent }),
      )
    },
    waitForIdle() {
      return buildQueue.waitForIdle()
    },
  }
}
