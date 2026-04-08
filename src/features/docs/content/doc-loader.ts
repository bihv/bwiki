import type { DocPage, DraftDocInput } from '../lib/docs-engine'
import { docFilePath, parseDocFile } from './doc-source'

function makeOverridePage(
  draft: DraftDocInput,
  timestamp: string,
  previousPage?: DocPage,
): DocPage {
  return {
    id: `${draft.version}:${draft.locale}:${draft.slug}`,
    title: draft.title,
    summary: draft.summary,
    locale: draft.locale,
    version: draft.version,
    slug: draft.slug,
    section: draft.section,
    order: previousPage?.order ?? 999,
    status: 'published',
    tags: draft.tags,
    updatedAt: timestamp,
    sourcePath: docFilePath({
      scope: 'draft',
      version: draft.version,
      locale: draft.locale,
      slug: draft.slug,
    }),
    body: draft.body,
    translationKey: draft.translationKey,
    translationStatus: draft.translationStatus,
  }
}

export function parseDocSource(path: string, source: string): DocPage {
  return parseDocFile(path, source).page
}

export function mergePublishedPages(
  seedPages: DocPage[],
  publishedOverrides: DraftDocInput[],
  timestamp: string,
): DocPage[] {
  const pageMap = new Map<string, DocPage>()

  for (const page of seedPages) {
    pageMap.set(`${page.locale}:${page.version}:${page.slug}`, page)
  }

  for (const override of publishedOverrides) {
    const key = `${override.locale}:${override.version}:${override.slug}`
    const previousPage = pageMap.get(key)
    pageMap.set(key, makeOverridePage(override, timestamp, previousPage))
  }

  return [...pageMap.values()].sort(
    (left, right) =>
      left.locale.localeCompare(right.locale) ||
      left.version.localeCompare(right.version) ||
      left.order - right.order ||
      left.title.localeCompare(right.title),
  )
}

export function loadSeedDocs(): DocPage[] {
  const modules = import.meta.glob('/content/docs/**/*.mdx', {
    eager: true,
    import: 'default',
    query: '?raw',
  }) as Record<string, string>

  return Object.entries(modules)
    .map(([path, source]) => parseDocSource(path, source))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
}
