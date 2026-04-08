import { z } from 'zod'

import type { DocPage, TranslationStatus } from '../lib/docs-engine'

const docFrontmatterSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  section: z.string().trim().min(1),
  order: z.number().int().nonnegative().default(999),
  tags: z.array(z.string()).default([]),
  translationKey: z.string().trim().min(1),
  translationStatus: z.enum(['current', 'missing', 'outdated']).default('current'),
  status: z.enum(['draft', 'published']).default('published'),
})

type DocScope = 'draft' | 'published'

interface ParsedDocPath {
  scope: DocScope
  version: string
  locale: string
  slug: string
}

export function docFilePath(input: {
  scope: DocScope
  version: string
  locale: string
  slug: string
}): string {
  const root = input.scope === 'draft' ? 'content/drafts' : 'content/docs'
  return `${root}/${input.version}/${input.locale}/${input.slug}.mdx`
}

function parsePath(path: string): ParsedDocPath {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const match = /(?:^|.*\/)content\/(docs|drafts)\/([^/]+)\/([^/]+)\/(.+)\.mdx$/.exec(normalized)

  if (!match) {
    throw new Error(`Could not infer scope, version, and locale from path: ${path}`)
  }

  return {
    scope: match[1] === 'docs' ? 'published' : 'draft',
    version: match[2] ?? '',
    locale: match[3] ?? '',
    slug: match[4] ?? '',
  }
}

function parseInlineArray(value: string): string[] {
  const items: string[] = []
  let current = ''
  let activeQuote: '"' | "'" | undefined

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (activeQuote) {
      if (character === '\\' && index + 1 < value.length) {
        current += value[index + 1] ?? ''
        index += 1
        continue
      }

      if (character === activeQuote) {
        activeQuote = undefined
        continue
      }

      current += character
      continue
    }

    if (character === '"' || character === "'") {
      activeQuote = character
      continue
    }

    if (character === ',') {
      const item = current.trim()
      if (item) {
        items.push(item)
      }
      current = ''
      continue
    }

    current += character
  }

  const trailingItem = current.trim()
  if (trailingItem) {
    items.push(trailingItem)
  }

  return items
}

function parseScalar(value: string): string | number | string[] {
  const trimmed = value.trim()

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseInlineArray(trimmed.slice(1, -1))
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }

  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseFrontmatter(source: string): { data: Record<string, unknown>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) {
    return { data: {}, content: source }
  }

  const rawFrontmatter = match[1] ?? ''
  const content = match[2] ?? ''
  const data: Record<string, unknown> = {}
  const lines = rawFrontmatter.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim()
    if (!line) {
      continue
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      throw new Error(`Malformed frontmatter line: ${line}`)
    }

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()

    if (!rawValue) {
      const values: string[] = []
      while (index + 1 < lines.length && lines[index + 1]?.trim().startsWith('- ')) {
        values.push(String(parseScalar(lines[index + 1]?.trim().slice(2) ?? '')))
        index += 1
      }
      data[key] = values
      continue
    }

    data[key] = parseScalar(rawValue)
  }

  return { data, content }
}

export function parseDocFile(path: string, source: string): {
  path: { scope: DocScope; version: string; locale: string; slug: string }
  page: DocPage
} {
  const { data, content } = parseFrontmatter(source)
  const frontmatter = docFrontmatterSchema.parse(data)
  const pathInfo = parsePath(path)
  if (frontmatter.slug !== pathInfo.slug) {
    throw new Error(`Frontmatter slug "${frontmatter.slug}" does not match path slug "${pathInfo.slug}"`)
  }
  const canonicalPath = docFilePath({
    scope: pathInfo.scope,
    version: pathInfo.version,
    locale: pathInfo.locale,
    slug: pathInfo.slug,
  })

  return {
    path: pathInfo,
    page: {
      id: `${pathInfo.version}:${pathInfo.locale}:${pathInfo.slug}`,
      title: frontmatter.title,
      summary: frontmatter.summary,
      locale: pathInfo.locale,
      version: pathInfo.version,
      slug: pathInfo.slug,
      section: frontmatter.section,
      order: frontmatter.order,
      status: frontmatter.status,
      tags: frontmatter.tags,
      updatedAt: '',
      sourcePath: canonicalPath,
      body: content.trim(),
      translationKey: frontmatter.translationKey,
      translationStatus: frontmatter.translationStatus as TranslationStatus,
    },
  }
}

export function serializeDocFile(page: Pick<
  DocPage,
  | 'title'
  | 'summary'
  | 'slug'
  | 'section'
  | 'order'
  | 'tags'
  | 'translationKey'
  | 'translationStatus'
  | 'status'
  | 'body'
>): string {
  const tagLines = page.tags.map((tag) => `  - ${tag}`).join('\n')
  const tagsBlock = page.tags.length > 0 ? `tags:\n${tagLines}` : 'tags: []'

  return `---
title: ${page.title}
summary: ${page.summary}
slug: ${page.slug}
section: ${page.section}
order: ${page.order}
${tagsBlock}
translationKey: ${page.translationKey}
translationStatus: ${page.translationStatus}
status: ${page.status}
---
${page.body}
`
}
