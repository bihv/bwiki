import Fuse from 'fuse.js'

import {
  generatedDocsManifest,
  generatedDocsSiteConfig,
  type GeneratedPublicDocPage,
} from '../generated/docs-manifest.generated'
import { generatedDocsSearch } from '../generated/docs-search.generated'
import type { NavTreeNode, SiteConfig } from '../lib/docs-engine'

export type PublicDocPage = GeneratedPublicDocPage

export interface ResolvedPublicDocPage {
  page?: PublicDocPage
  redirectFrom?: string
  resolvedLocale?: string
  resolvedVersion?: string
  fallbackReason?: 'locale' | 'locale-and-version' | 'version'
}

export const publicDocsPages: PublicDocPage[] = generatedDocsManifest.filter((page) => page.status === 'published')
export const publicDocsSiteConfig: SiteConfig = generatedDocsSiteConfig

const publicSearch = new Fuse(generatedDocsSearch.filter((page) => page.status === 'published'), {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: ['title', 'summary', 'tags', 'searchableText'],
})

export const publicDefaultLocale =
  publicDocsSiteConfig.locales.find((locale) => locale.isDefault)?.key ??
  publicDocsSiteConfig.locales[0]?.key ??
  'en'

export const publicLatestVersion =
  publicDocsSiteConfig.versions.find((version) => version.isLatest)?.key ??
  publicDocsSiteConfig.versions[0]?.key ??
  'latest'

export function getPublicDocPage(locale: string, version: string, slug: string): PublicDocPage | undefined {
  return publicDocsPages.find(
    (page) =>
      page.status === 'published' &&
      page.locale === locale &&
      page.version === version &&
      page.slug === slug,
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=,[\]{}|\\:;"'<>,.?/]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function normalizePublicPages(pages: PublicDocPage[]): PublicDocPage[] {
  return [...pages].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
}

function getDefaultLocale(siteConfig: SiteConfig): string {
  return siteConfig.locales.find((locale) => locale.isDefault)?.key ?? siteConfig.locales[0]?.key ?? 'en'
}

function getLatestVersion(siteConfig: SiteConfig): string {
  return siteConfig.versions.find((version) => version.isLatest)?.key ?? siteConfig.versions[0]?.key ?? 'latest'
}

function findPublicPage(
  pages: PublicDocPage[],
  locale: string,
  version: string,
  slug: string,
): PublicDocPage | undefined {
  return pages.find(
    (page) =>
      page.status === 'published' &&
      page.locale === locale &&
      page.version === version &&
      page.slug === slug,
  )
}

export function resolvePublicDocPage(input: {
  pages: PublicDocPage[]
  siteConfig: SiteConfig
  locale: string
  version: string
  slug: string
}): ResolvedPublicDocPage {
  const publishedPages = normalizePublicPages(input.pages.filter((page) => page.status === 'published'))
  const redirect = input.siteConfig.redirects.find(
    (rule) =>
      rule.from === input.slug &&
      (!rule.locale || rule.locale === input.locale) &&
      (!rule.version || rule.version === input.version),
  )

  const targetSlug = redirect?.to ?? input.slug
  const exactPage = findPublicPage(publishedPages, input.locale, input.version, targetSlug)

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

  const sameLocaleLatest = findPublicPage(publishedPages, input.locale, latestVersion, targetSlug)
  if (sameLocaleLatest) {
    return {
      page: sameLocaleLatest,
      redirectFrom: redirect ? input.slug : undefined,
      resolvedLocale: sameLocaleLatest.locale,
      resolvedVersion: sameLocaleLatest.version,
      fallbackReason: 'version',
    }
  }

  const defaultLocaleRequestedVersion = findPublicPage(
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

  const defaultLocaleLatest = findPublicPage(publishedPages, defaultLocale, latestVersion, targetSlug)
  return {
    page: defaultLocaleLatest,
    redirectFrom: redirect ? input.slug : undefined,
    resolvedLocale: defaultLocaleLatest?.locale,
    resolvedVersion: defaultLocaleLatest?.version,
    fallbackReason: defaultLocaleLatest ? 'locale-and-version' : undefined,
  }
}

export function buildPublicDocTree(pages: PublicDocPage[], locale: string, version: string): NavTreeNode[] {
  const groups = new Map<string, NavTreeNode>()

  for (const page of normalizePublicPages(pages)) {
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

export function searchPublicDocs(
  query: string,
  options: { locale: string; version: string; limit?: number },
): PublicDocPage[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return []
  }

  return publicSearch
    .search(trimmedQuery)
    .map((result) => result.item)
    .filter((page) => page.locale === options.locale && page.version === options.version)
    .slice(0, options.limit ?? 8)
    .map(({ searchableText: _searchableText, ...page }) => page)
}
