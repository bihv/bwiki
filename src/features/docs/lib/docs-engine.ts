import Fuse from 'fuse.js'
import { z } from 'zod'

export type DocStatus = 'draft' | 'published'
export type TranslationStatus = 'current' | 'missing' | 'outdated'

export interface LocaleDescriptor {
  key: string
  label: string
  isDefault?: boolean
}

export interface VersionDescriptor {
  key: string
  label: string
  isDeprecated?: boolean
  isLatest?: boolean
  isStable?: boolean
}

export interface RedirectRule {
  from: string
  to: string
  locale?: string
  version?: string
}

export interface SiteConfig {
  locales: LocaleDescriptor[]
  versions: VersionDescriptor[]
  componentRegistry: string[]
  redirects: RedirectRule[]
}

export interface DocPage {
  id: string
  title: string
  summary: string
  locale: string
  version: string
  slug: string
  section: string
  order: number
  status: DocStatus
  tags: string[]
  updatedAt: string
  sourcePath: string
  body: string
  translationKey: string
  translationStatus: TranslationStatus
}

export interface DraftDocInput {
  title: string
  summary: string
  locale: string
  version: string
  slug: string
  section: string
  tags: string[]
  body: string
  translationKey: string
  translationStatus: TranslationStatus
}

export interface PublishActor {
  id: string
  name: string
  role: 'admin' | 'editor'
}

export interface PublishRecord {
  actor: string
  actorId: string
  role: PublishActor['role']
  locale: string
  version: string
  targetSlug: string
  timestamp: string
  result: 'published'
}

export interface PublishState {
  pages: DocPage[]
  drafts: Record<string, DraftDocInput>
  publishRecords: PublishRecord[]
}

export interface ResolvedDocPage {
  page?: DocPage
  redirectFrom?: string
  resolvedLocale?: string
  resolvedVersion?: string
  fallbackReason?: 'locale' | 'locale-and-version' | 'version'
}

export interface HeadingItem {
  id: string
  depth: number
  title: string
}

export interface NavTreeNode {
  id: string
  title: string
  children: Array<{
    id: string
    slug: string
    title: string
    order: number
  }>
}

const draftSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  summary: z.string().trim().min(1, 'Summary is required'),
  locale: z.string().trim().min(1, 'Locale is required'),
  version: z.string().trim().min(1, 'Version is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/, 'Slug must use lowercase path segments'),
  section: z.string().trim().min(1, 'Section is required'),
  tags: z.array(z.string().trim().min(1)).default([]),
  body: z.string().trim().min(1, 'Body is required'),
  translationKey: z.string().trim().min(1, 'Translation key is required'),
  translationStatus: z.enum(['current', 'missing', 'outdated']),
})

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=,[\]{}|\\:;"'<>,.?/]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function getDefaultLocale(siteConfig: SiteConfig): string {
  return siteConfig.locales.find((locale) => locale.isDefault)?.key ?? siteConfig.locales[0]?.key ?? 'en'
}

function getLatestVersion(siteConfig: SiteConfig): string {
  return siteConfig.versions.find((version) => version.isLatest)?.key ?? siteConfig.versions[0]?.key ?? 'latest'
}

function findPublishedPage(pages: DocPage[], locale: string, version: string, slug: string): DocPage | undefined {
  return pages.find(
    (page) =>
      page.status === 'published' &&
      page.locale === locale &&
      page.version === version &&
      page.slug === slug,
  )
}

function normalizePages(pages: DocPage[]): DocPage[] {
  return [...pages].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
}

function stripMarkdown(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+]\(([^)]+)\)/g, ' $1 ')
    .replace(/[#>*`_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getCustomComponents(source: string): string[] {
  const components = new Set<string>()
  const matcher = /<([A-Z][A-Za-z0-9]*)\b/g

  for (const match of source.matchAll(matcher)) {
    if (match[1]) {
      components.add(match[1])
    }
  }

  return [...components]
}

function getInternalDocLinks(source: string): string[] {
  const links = new Set<string>()
  const matcher = /\[[^\]]+]\((\/docs\/[^)]+)\)/g

  for (const match of source.matchAll(matcher)) {
    if (match[1]) {
      links.add(match[1])
    }
  }

  return [...links]
}

function parseDocPath(pathname: string): { locale: string; version: string; slug: string } | undefined {
  const normalized = pathname.replace(/^\/+/, '')
  const parts = normalized.split('/')

  if (parts.length < 4 || parts[0] !== 'docs') {
    return undefined
  }

  return {
    locale: parts[1] ?? '',
    version: parts[2] ?? '',
    slug: parts.slice(3).join('/'),
  }
}

export function resolveDocPage(input: {
  pages: DocPage[]
  siteConfig: SiteConfig
  locale: string
  version: string
  slug: string
}): ResolvedDocPage {
  const publishedPages = normalizePages(input.pages.filter((page) => page.status === 'published'))
  const redirect = input.siteConfig.redirects.find(
    (rule) =>
      rule.from === input.slug &&
      (!rule.locale || rule.locale === input.locale) &&
      (!rule.version || rule.version === input.version),
  )

  const targetSlug = redirect?.to ?? input.slug
  const exactPage = findPublishedPage(publishedPages, input.locale, input.version, targetSlug)

  if (exactPage) {
    return {
      page: exactPage,
      redirectFrom: redirect ? input.slug : undefined,
      resolvedLocale: exactPage.locale,
      resolvedVersion: exactPage.version,
    }
  }

  const latestVersion = getLatestVersion(input.siteConfig)
  const defaultLocale = getDefaultLocale(input.siteConfig)

  const sameLocaleLatest = findPublishedPage(publishedPages, input.locale, latestVersion, targetSlug)
  if (sameLocaleLatest) {
    return {
      page: sameLocaleLatest,
      redirectFrom: redirect ? input.slug : undefined,
      resolvedLocale: sameLocaleLatest.locale,
      resolvedVersion: sameLocaleLatest.version,
      fallbackReason: 'version',
    }
  }

  const defaultLocaleRequestedVersion = findPublishedPage(
    publishedPages,
    defaultLocale,
    input.version,
    targetSlug,
  )
  if (defaultLocaleRequestedVersion) {
    return {
      page: defaultLocaleRequestedVersion,
      redirectFrom: redirect ? input.slug : undefined,
      resolvedLocale: defaultLocaleRequestedVersion.locale,
      resolvedVersion: defaultLocaleRequestedVersion.version,
      fallbackReason: 'locale',
    }
  }

  const defaultLocaleLatest = findPublishedPage(publishedPages, defaultLocale, latestVersion, targetSlug)
  return {
    page: defaultLocaleLatest,
    redirectFrom: redirect ? input.slug : undefined,
    resolvedLocale: defaultLocaleLatest?.locale,
    resolvedVersion: defaultLocaleLatest?.version,
    fallbackReason: defaultLocaleLatest ? 'locale-and-version' : undefined,
  }
}

export function buildDocTree(pages: DocPage[], locale: string, version: string): NavTreeNode[] {
  const groups = new Map<string, NavTreeNode>()

  for (const page of normalizePages(pages)) {
    if (page.status !== 'published' || page.locale !== locale || page.version !== version) {
      continue
    }

    const existingGroup =
      groups.get(page.section) ??
      {
        id: slugify(page.section),
        title: page.section,
        children: [],
      }

    existingGroup.children.push({
      id: page.id,
      slug: page.slug,
      title: page.title,
      order: page.order,
    })
    existingGroup.children.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
    groups.set(page.section, existingGroup)
  }

  return [...groups.values()]
}

export function extractHeadings(body: string): HeadingItem[] {
  const headings: HeadingItem[] = []
  let inFence = false

  for (const line of body.split('\n')) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence
      continue
    }

    if (inFence) {
      continue
    }

    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (!match) {
      continue
    }

    headings.push({
      id: slugify(match[2] ?? ''),
      depth: match[1]?.length ?? 1,
      title: (match[2] ?? '').trim(),
    })
  }

  return headings
}

export function validateDraft(
  draft: DraftDocInput,
  pages: DocPage[],
  siteConfig: SiteConfig,
): { valid: boolean; errors: string[] } {
  const parsed = draftSchema.safeParse(draft)
  const errors = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)

  const usedComponents = getCustomComponents(draft.body)
  const unknownComponents = usedComponents.filter(
    (componentName) => !siteConfig.componentRegistry.includes(componentName),
  )

  if (unknownComponents.length > 0) {
    errors.push(`Unknown components: ${unknownComponents.join(', ')}`)
  }

  const brokenLinks = getInternalDocLinks(draft.body).filter((link) => {
    const parsedLink = parseDocPath(link)
    if (!parsedLink) {
      return true
    }

    return !findPublishedPage(pages, parsedLink.locale, parsedLink.version, parsedLink.slug)
  })

  if (brokenLinks.length > 0) {
    errors.push(`Broken internal links: ${brokenLinks.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

function makeDocId(draft: DraftDocInput): string {
  return `${draft.version}:${draft.locale}:${draft.slug}`
}

export function publishDraft(input: {
  state: PublishState
  draft: DraftDocInput
  actor: PublishActor
  siteConfig: SiteConfig
  timestamp: string
}): { state: PublishState; errors: string[] } {
  const validation = validateDraft(input.draft, input.state.pages, input.siteConfig)
  if (!validation.valid) {
    return {
      state: input.state,
      errors: validation.errors,
    }
  }

  const nextPage: DocPage = {
    id: makeDocId(input.draft),
    title: input.draft.title,
    summary: input.draft.summary,
    locale: input.draft.locale,
    version: input.draft.version,
    slug: input.draft.slug,
    section: input.draft.section,
    order: 999,
    status: 'published',
    tags: input.draft.tags,
    updatedAt: input.timestamp,
    sourcePath: `drafts/${input.draft.version}/${input.draft.locale}/${input.draft.slug}.mdx`,
    body: input.draft.body,
    translationKey: input.draft.translationKey,
    translationStatus: input.draft.translationStatus,
  }

  const pages = input.state.pages.filter(
    (page) =>
      !(page.locale === nextPage.locale && page.version === nextPage.version && page.slug === nextPage.slug),
  )
  pages.push(nextPage)

  const draftKey = makeDocId(input.draft)
  const drafts = { ...input.state.drafts }
  delete drafts[draftKey]

  const publishRecords: PublishRecord[] = [
    {
      actor: input.actor.name,
      actorId: input.actor.id,
      role: input.actor.role,
      locale: input.draft.locale,
      version: input.draft.version,
      targetSlug: input.draft.slug,
      timestamp: input.timestamp,
      result: 'published',
    },
    ...input.state.publishRecords,
  ]

  return {
    state: {
      pages: normalizePages(pages),
      drafts,
      publishRecords,
    },
    errors: [],
  }
}

export function buildDocSearch(pages: DocPage[]) {
  const indexedPages = pages
    .filter((page) => page.status === 'published')
    .map((page) => ({
      ...page,
      searchableText: `${page.title} ${page.summary} ${page.tags.join(' ')} ${stripMarkdown(page.body)}`,
    }))

  const fuse = new Fuse(indexedPages, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: ['title', 'summary', 'tags', 'searchableText'],
  })

  return {
    search(query: string, options: { locale: string; version: string; limit?: number }) {
      const results = fuse.search(query)
      return results
        .map((result) => result.item)
        .filter((page) => page.locale === options.locale && page.version === options.version)
        .slice(0, options.limit ?? 8)
        .map(({ searchableText: _searchableText, ...page }) => page)
    },
  }
}
