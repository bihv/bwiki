import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { generateDocsArtifacts } from './generate-docs-artifacts'

async function writeFixtureFile(cwd: string, path: string, source: string) {
  const target = join(cwd, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source, 'utf8')
}

describe('generateDocsArtifacts', () => {
  it('emits lean public docs manifest, search index, module map, and body-only MDX pages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'bwiki-docs-artifacts-'))
    await writeFixtureFile(
      cwd,
      'content/system/site-config.json',
      JSON.stringify(
        {
          locales: [{ key: 'en', label: 'English', isDefault: true }],
          versions: [{ key: 'v9.0', label: '9.0', isLatest: true }],
          componentRegistry: ['Callout'],
          redirects: [{ from: 'intro', to: 'getting-started/introduction', locale: 'en', version: 'v9.0' }],
        },
        null,
        2,
      ),
    )
    await writeFixtureFile(
      cwd,
      'content/docs/v9.0/en/getting-started/introduction.mdx',
      `---
title: Introduction
summary: Start here.
slug: getting-started/introduction
section: Getting Started
order: 1
tags:
  - intro
translationKey: intro
translationStatus: current
status: published
---
# Introduction

<Callout tone="info">Welcome.</Callout>
`,
    )
    await writeFixtureFile(
      cwd,
      'content/docs/v9.0/en/internal/draft-only.mdx',
      `---
title: Draft Only
summary: Do not publish this.
slug: internal/draft-only
section: Internal
order: 99
tags:
  - internal
translationKey: draft-only
translationStatus: current
status: draft
---
# Draft Only

This draft must not appear in public artifacts.
`,
    )

    await generateDocsArtifacts({ cwd })

    const generatedRoot = join(cwd, 'src/features/docs/generated')
    const manifest = await readFile(join(generatedRoot, 'docs-manifest.generated.ts'), 'utf8')
    const search = await readFile(join(generatedRoot, 'docs-search.generated.ts'), 'utf8')
    const modules = await readFile(join(generatedRoot, 'docs-page-modules.generated.ts'), 'utf8')
    const generatedMdx = await readFile(
      join(generatedRoot, 'pages/v9.0/en/getting-started/introduction.mdx'),
      'utf8',
    )

    expect(manifest).toContain('generatedDocsManifest')
    expect(manifest).toContain('generatedDocsSiteConfig')
    expect(manifest).toContain('"sourcePath": "content/docs/v9.0/en/getting-started/introduction.mdx"')
    expect(manifest).not.toContain('"body":')
    expect(manifest).toContain('"headings": [')
    expect(manifest).toContain('"id": "introduction"')
    expect(manifest).toContain('"title": "Introduction"')
    expect(manifest).toContain('"redirects": [')
    expect(search).toContain('generatedDocsSearch')
    expect(search).not.toContain('"body":')
    expect(search).toContain('"searchableText": "Introduction Start here. intro Introduction Welcome."')
    expect(search).not.toContain('Draft Only')
    expect(modules).toContain('generatedPageModules')
    expect(modules).toContain('"v9.0:en:getting-started/introduction"')
    expect(modules).toContain('import("./pages/v9.0/en/getting-started/introduction.mdx")')
    expect(modules).not.toContain('"v9.0:en:internal/draft-only"')
    expect(generatedMdx).toBe(`# Introduction

<Callout tone="info">Welcome.</Callout>
`)
    await expect(readFile(join(generatedRoot, 'pages/v9.0/en/internal/draft-only.mdx'), 'utf8')).rejects.toThrow()
  })

  it('keeps the default build path wired to regenerate public docs artifacts', async () => {
    const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['build']).toBe('npm run docs:generate && tsc && vite build')
    expect(packageJson.scripts?.['build:public']).toBe('npm run build')
  })
})
