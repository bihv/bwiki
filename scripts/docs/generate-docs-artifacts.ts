import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseDocFile } from '../../src/features/docs/content/doc-source'
import { extractHeadings } from '../../src/features/docs/lib/docs-engine'
import type { DocPage, HeadingItem, SiteConfig } from '../../src/features/docs/lib/docs-engine'

interface GenerateDocsArtifactsInput {
  cwd: string
}

interface PublicDocPage extends Omit<DocPage, 'body'> {
  headings: HeadingItem[]
}

interface SearchDocPage extends PublicDocPage {
  searchableText: string
}

const generatedRootPath = 'src/features/docs/generated'
const pagesRootPath = `${generatedRootPath}/pages`

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) {
        return listFiles(path)
      }
      return [path]
    }),
  )

  return files.flat().sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right)))
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
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

function makePublicPage(page: DocPage): PublicDocPage {
  return {
    id: page.id,
    title: page.title,
    summary: page.summary,
    locale: page.locale,
    version: page.version,
    slug: page.slug,
    section: page.section,
    order: page.order,
    status: page.status,
    tags: page.tags,
    updatedAt: page.updatedAt,
    sourcePath: page.sourcePath,
    translationKey: page.translationKey,
    translationStatus: page.translationStatus,
    headings: extractHeadings(page.body),
  }
}

function makeSearchEntry(page: DocPage): SearchDocPage {
  return {
    ...makePublicPage(page),
    searchableText: `${page.title} ${page.summary} ${page.tags.join(' ')} ${stripMarkdown(page.body)}`.trim(),
  }
}

function serializeTsExport(name: string, value: unknown, typeName: string): string {
  return `export const ${name} = ${JSON.stringify(value, null, 2)} satisfies ${typeName}\n`
}

async function writeGeneratedFile(cwd: string, path: string, source: string) {
  const target = join(cwd, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source, 'utf8')
}

function pageModulePath(page: DocPage): string {
  return `./pages/${page.version}/${page.locale}/${page.slug}.mdx`
}

function renderPageModules(pages: DocPage[]): string {
  const entries = pages
    .map((page) => `  ${JSON.stringify(page.id)}: () => import(${JSON.stringify(pageModulePath(page))}),`)
    .join('\n')

  return `import type { ComponentType } from 'react'

export type GeneratedPageModule = {
  default: ComponentType<Record<string, unknown>>
}

export const generatedPageModules: Record<string, () => Promise<GeneratedPageModule>> = {
${entries}
}
`
}

function renderManifest(siteConfig: SiteConfig, pages: PublicDocPage[]): string {
  return `import type { DocPage, HeadingItem, SiteConfig } from '../lib/docs-engine'

export interface GeneratedPublicDocPage extends Omit<DocPage, 'body'> {
  headings: HeadingItem[]
}

${serializeTsExport('generatedDocsSiteConfig', siteConfig, 'SiteConfig')}
${serializeTsExport('generatedDocsManifest', pages, 'GeneratedPublicDocPage[]')}`
}

function renderSearch(searchEntries: SearchDocPage[]): string {
  return `import type { GeneratedPublicDocPage } from './docs-manifest.generated'

export interface GeneratedDocsSearchEntry extends GeneratedPublicDocPage {
  searchableText: string
}

${serializeTsExport('generatedDocsSearch', searchEntries, 'GeneratedDocsSearchEntry[]')}`
}

function renderMdxModuleDeclaration(): string {
  return `declare module '*.mdx' {
  import type { ComponentType } from 'react'

  const MDXContent: ComponentType<Record<string, unknown>>
  export default MDXContent
}
`
}

async function readPublishedDocs(cwd: string): Promise<DocPage[]> {
  const docsRoot = join(cwd, 'content/docs')
  const files = (await listFiles(docsRoot)).filter((path) => path.endsWith('.mdx'))
  const pages = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8')
      const path = toPosixPath(relative(cwd, file))
      return parseDocFile(path, source).page
    }),
  )

  return pages.filter((page) => page.status === 'published').sort(
    (left, right) =>
      left.locale.localeCompare(right.locale) ||
      left.version.localeCompare(right.version) ||
      left.order - right.order ||
      left.title.localeCompare(right.title),
  )
}

export async function generateDocsArtifacts({ cwd }: GenerateDocsArtifactsInput) {
  const siteConfig = await readJson<SiteConfig>(join(cwd, 'content/system/site-config.json'))
  const pages = await readPublishedDocs(cwd)
  const generatedRoot = join(cwd, generatedRootPath)

  await rm(generatedRoot, { force: true, recursive: true })
  await mkdir(join(cwd, pagesRootPath), { recursive: true })

  await Promise.all(
    pages.map((page) =>
      writeGeneratedFile(cwd, `${pagesRootPath}/${page.version}/${page.locale}/${page.slug}.mdx`, `${page.body}\n`),
    ),
  )
  await Promise.all([
    writeGeneratedFile(cwd, `${generatedRootPath}/docs-manifest.generated.ts`, renderManifest(siteConfig, pages.map(makePublicPage))),
    writeGeneratedFile(cwd, `${generatedRootPath}/docs-search.generated.ts`, renderSearch(pages.map(makeSearchEntry))),
    writeGeneratedFile(cwd, `${generatedRootPath}/docs-page-modules.generated.ts`, renderPageModules(pages)),
    writeGeneratedFile(cwd, `${generatedRootPath}/mdx.d.ts`, renderMdxModuleDeclaration()),
  ])

  return {
    pages: pages.length,
    outputPath: generatedRoot,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDocsArtifacts({ cwd: process.cwd() })
    .then((result) => {
      console.log(`Generated ${result.pages} docs pages into ${toPosixPath(relative(process.cwd(), result.outputPath))}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
