import { isAbsolute, join, relative, resolve } from 'node:path'

import { docFilePath } from '../../src/features/docs/content/doc-source'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

const SAFE_SINGLE_SEGMENT_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/
const SAFE_SLUG_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/

export class InvalidContentPathError extends Error {
  constructor(message = 'Invalid content path') {
    super(message)
    this.name = 'InvalidContentPathError'
  }
}

function ensureSafeSingleSegment(value: string, label: string): string {
  const normalizedValue = value.trim()

  if (!SAFE_SINGLE_SEGMENT_PATTERN.test(normalizedValue)) {
    throw new InvalidContentPathError(`${label} must be a single safe path segment`)
  }

  return normalizedValue
}

function ensureSafeSlug(value: string): string {
  const normalizedValue = value.trim()

  if (!SAFE_SLUG_PATTERN.test(normalizedValue)) {
    throw new InvalidContentPathError('Slug must use lowercase path segments')
  }

  return normalizedValue
}

function assertWithinRoot(rootPath: string, candidatePath: string, label: string): string {
  const resolvedPath = resolve(candidatePath)
  const relativePath = relative(rootPath, resolvedPath)

  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    return resolvedPath
  }

  throw new InvalidContentPathError(`${label} resolves outside the allowed content root`)
}

export interface DraftLocation {
  absolutePath: string
  canonicalPath: string
  locale: string
  slug: string
  version: string
}

export interface ContentPathService {
  contentRootPath: string
  draftsRootPath: string
  systemRootPath: string
  getCanonicalPathFromAbsolute: (absolutePath: string) => string
  getSystemFilePath: (fileName: string) => string
  resolveDraftLocation: (input: { locale: string; version: string; slug: string }) => DraftLocation
}

export function createContentPathService(options: { contentRootPath?: string } = {}): ContentPathService {
  const contentRootPath = resolve(options.contentRootPath ?? 'content')
  const draftsRootPath = join(contentRootPath, 'drafts')
  const systemRootPath = join(contentRootPath, 'system')

  return {
    contentRootPath,
    draftsRootPath,
    systemRootPath,
    resolveDraftLocation(input) {
      const locale = ensureSafeSingleSegment(input.locale, 'Locale')
      const version = ensureSafeSingleSegment(input.version, 'Version')
      const slug = ensureSafeSlug(input.slug)
      const canonicalPath = docFilePath({
        scope: 'draft',
        locale,
        version,
        slug,
      })
      const absolutePath = assertWithinRoot(
        draftsRootPath,
        resolve(draftsRootPath, version, locale, `${slug}.mdx`),
        'Draft path',
      )

      return { absolutePath, canonicalPath, locale, version, slug }
    },
    getCanonicalPathFromAbsolute(absolutePath) {
      const relativePath = toPosixPath(relative(contentRootPath, assertWithinRoot(contentRootPath, absolutePath, 'Content path')))
      return `content/${relativePath}`
    },
    getSystemFilePath(fileName) {
      return assertWithinRoot(systemRootPath, resolve(systemRootPath, fileName), 'System path')
    },
  }
}
