import { docsSiteConfig } from '../content/site-config'
import type { DraftDocInput, DocPage } from '../lib/docs-engine'

export const defaultLocale =
  docsSiteConfig.locales.find((locale) => locale.isDefault)?.key ??
  docsSiteConfig.locales[0]?.key ??
  'en'

export const latestVersion =
  docsSiteConfig.versions.find((version) => version.isLatest)?.key ??
  docsSiteConfig.versions[0]?.key ??
  'v2.0'

export function pagePath(locale: string, version: string, slug: string) {
  return `/docs/${locale}/${version}/${slug}`
}

export function createDraftFromPage(page?: DocPage): DraftDocInput {
  if (!page) {
    return {
      title: '',
      summary: '',
      locale: defaultLocale,
      version: latestVersion,
      slug: '',
      section: 'Getting Started',
      tags: [],
      body: '# New page\n\nStart writing here.',
      translationKey: '',
      translationStatus: 'current',
    }
  }

  return {
    title: page.title,
    summary: page.summary,
    locale: page.locale,
    version: page.version,
    slug: page.slug,
    section: page.section,
    tags: page.tags,
    body: page.body,
    translationKey: page.translationKey,
    translationStatus: page.translationStatus,
  }
}

export function slugFromText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
