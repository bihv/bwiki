# Build-Time Docs Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-only docs demo with a file-backed docs system where drafts are stored on the server, published docs are compiled into build-time artifacts, and `Publish` triggers a safe background rebuild/promote flow.

**Architecture:** Keep the existing Vite SPA for the UI and add a `server/` Node control plane for draft persistence, publish orchestration, and build promotion. Published docs move onto generated artifacts under `src/features/docs/generated`, while draft preview keeps runtime MDX evaluation. The server owns writable content roots under `content/` and serves the last known good public build from a promoted runtime directory.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest, Express, `tsx`, `@mdx-js/rollup`, Node `fs/path`, `zod`, `fuse.js`

---

## Planned File Structure

### Shared docs domain and content layout

- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`
- Create: `content/drafts/.gitkeep`
- Create: `content/system/site-config.json`
- Create: `content/system/redirects.json`
- Create: `content/system/media.json`
- Create: `content/system/publish-history.json`
- Create: `content/system/build-state.json`
- Create: `src/features/docs/content/doc-source.ts`
- Create: `src/features/docs/content/doc-source.test.ts`
- Modify: `src/features/docs/content/doc-loader.ts`
- Modify: `src/features/docs/content/doc-loader.test.ts`

### Generated public docs artifacts

- Create: `scripts/docs/generate-docs-artifacts.ts`
- Create: `scripts/docs/generate-docs-artifacts.test.ts`
- Create: `src/features/docs/content/public-docs.ts`
- Create: `src/features/docs/components/published-doc-renderer.tsx`
- Create (generated): `src/features/docs/generated/docs-manifest.generated.ts`
- Create (generated): `src/features/docs/generated/docs-search.generated.ts`
- Create (generated): `src/features/docs/generated/docs-page-modules.generated.ts`
- Create (generated): `src/features/docs/generated/pages/<version>/<locale>/<slug>.mdx`
- Modify: `src/features/docs/routes/reader-page.tsx`
- Modify: `src/features/docs/routes/helpers.ts`
- Modify: `src/features/docs/content/site-config.ts`

### Server control plane and frontend API state

- Create: `server/index.ts`
- Create: `server/app.ts`
- Create: `server/config.ts`
- Create: `server/services/content-paths.ts`
- Create: `server/services/draft-repository.ts`
- Create: `server/services/system-repository.ts`
- Create: `server/services/public-build-repository.ts`
- Create: `server/services/build-queue.ts`
- Create: `server/services/publish-service.ts`
- Create: `server/routes/docs-routes.ts`
- Create: `server/test/test-content-root.ts`
- Create: `server/test/draft-repository.test.ts`
- Create: `server/test/docs-api.test.ts`
- Create: `server/test/publish-service.test.ts`
- Create: `src/features/docs/state/docs-api.ts`
- Create: `src/features/docs/state/docs-store.test.tsx`
- Modify: `src/features/docs/state/docs-store.tsx`
- Modify: `src/features/docs/routes/admin-page.tsx`
- Modify: `src/app.tsx`
- Modify: `src/features/docs/components/mdx-renderer.tsx`

## Task 1: Extract Shared Content Primitives And Seed Server Content Roots

**Files:**
- Create: `src/features/docs/content/doc-source.ts`
- Create: `src/features/docs/content/doc-source.test.ts`
- Modify: `src/features/docs/content/doc-loader.ts`
- Modify: `src/features/docs/content/doc-loader.test.ts`
- Create: `content/drafts/.gitkeep`
- Create: `content/system/site-config.json`
- Create: `content/system/redirects.json`
- Create: `content/system/media.json`
- Create: `content/system/publish-history.json`
- Create: `content/system/build-state.json`
- Modify: `.gitignore`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write the failing parser and serializer tests**

```ts
import { describe, expect, it } from 'vitest'

import { docFilePath, parseDocFile, serializeDocFile } from './doc-source'

describe('parseDocFile', () => {
  it('extracts metadata and MDX body from a published doc file', () => {
    const parsed = parseDocFile(
      'content/docs/v2.0/en/guides/cli.mdx',
      `---
title: CLI Guide
summary: Automate content operations.
slug: guides/cli
section: Guides
order: 2
tags: [cli]
translationKey: cli
translationStatus: current
status: published
---
# CLI Guide

<Callout tone="info">Fast publish flow.</Callout>
`,
    )

    expect(parsed.page.slug).toBe('guides/cli')
    expect(parsed.page.version).toBe('v2.0')
    expect(parsed.page.locale).toBe('en')
    expect(parsed.page.body).toContain('<Callout')
  })
})

describe('serializeDocFile', () => {
  it('writes frontmatter back in canonical order', () => {
    const source = serializeDocFile({
      title: 'CLI Guide',
      summary: 'Automate content operations.',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      section: 'Guides',
      order: 2,
      tags: ['cli'],
      body: '# CLI Guide',
      translationKey: 'cli',
      translationStatus: 'current',
      status: 'published',
    })

    expect(source).toContain('title: CLI Guide')
    expect(source).toContain('slug: guides/cli')
    expect(source).toContain('# CLI Guide')
  })
})
```

- [ ] **Step 2: Run the focused content tests and verify they fail**

Run: `npm run test:run -- src/features/docs/content/doc-source.test.ts`
Expected: FAIL with module-not-found or missing export errors for `./doc-source`.

- [ ] **Step 3: Implement pure content helpers in `doc-source.ts`**

```ts
export function docFilePath(input: {
  scope: 'draft' | 'published'
  version: string
  locale: string
  slug: string
}) {
  const root = input.scope === 'draft' ? 'content/drafts' : 'content/docs'
  return `${root}/${input.version}/${input.locale}/${input.slug}.mdx`
}

export function parseDocFile(path: string, source: string) {
  const { data, content } = parseFrontmatter(source)
  return { page: toDocPage(path, data, content), frontmatter: data }
}

export function serializeDocFile(page: SerializableDocPage) {
  return [
    '---',
    `title: ${page.title}`,
    `summary: ${page.summary}`,
    `slug: ${page.slug}`,
    `section: ${page.section}`,
    `order: ${page.order}`,
    `tags: [${page.tags.join(', ')}]`,
    `translationKey: ${page.translationKey}`,
    `translationStatus: ${page.translationStatus}`,
    `status: ${page.status}`,
    '---',
    page.body.trim(),
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Refactor `doc-loader.ts` to consume the new pure helpers**

```ts
import { parseDocFile } from './doc-source'

export function parseDocSource(path: string, source: string): DocPage {
  return parseDocFile(path, source).page
}
```

- [ ] **Step 5: Seed server-owned metadata files and ignore generated runtime output**

Seed with `[]`:

- `content/system/redirects.json`
- `content/system/media.json`
- `content/system/publish-history.json`

Seed `content/system/build-state.json` with:

```json
{
  "status": "idle",
  "currentBuildId": null,
  "lastSuccessfulBuildId": null,
  "queuedAt": null,
  "updatedAt": null,
  "error": null
}
```

Add ignore rules:

```gitignore
content/drafts/*
!content/drafts/.gitkeep
src/features/docs/generated/*
.runtime/
```

- [ ] **Step 6: Re-run content tests and verify they pass**

Run: `npm run test:run -- src/features/docs/content/doc-source.test.ts src/features/docs/content/doc-loader.test.ts`
Expected: PASS for parser and loader tests.

- [ ] **Step 7: Commit**

```bash
git add .gitignore tsconfig.json content/system content/drafts/.gitkeep src/features/docs/content/doc-source.ts src/features/docs/content/doc-source.test.ts src/features/docs/content/doc-loader.ts src/features/docs/content/doc-loader.test.ts
git commit -m "refactor: extract docs content primitives"
```

## Task 2: Generate Build-Time Public Docs Artifacts And Compiled MDX Pages

**Files:**
- Create: `scripts/docs/generate-docs-artifacts.ts`
- Create: `scripts/docs/generate-docs-artifacts.test.ts`
- Create: `src/features/docs/content/public-docs.ts`
- Create: `src/features/docs/components/published-doc-renderer.tsx`
- Create (generated): `src/features/docs/generated/docs-manifest.generated.ts`
- Create (generated): `src/features/docs/generated/docs-search.generated.ts`
- Create (generated): `src/features/docs/generated/docs-page-modules.generated.ts`
- Create (generated): `src/features/docs/generated/pages/<version>/<locale>/<slug>.mdx`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/features/docs/routes/reader-page.tsx`
- Modify: `src/features/docs/routes/helpers.ts`
- Modify: `src/features/docs/content/site-config.ts`

- [ ] **Step 1: Write the failing generator test**

```ts
// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { generateDocsArtifacts } from './generate-docs-artifacts'

describe('generateDocsArtifacts', () => {
  it('writes manifest, search, module map, and body-only generated MDX files', async () => {
    const outputRoot = await generateDocsArtifacts({ cwd: process.cwd() })

    const manifest = await readFile(`${outputRoot}/docs-manifest.generated.ts`, 'utf8')
    const search = await readFile(`${outputRoot}/docs-search.generated.ts`, 'utf8')
    const pageDir = await readdir(`${outputRoot}/pages/v2.0/en/guides`)

    expect(manifest).toContain('guides/cli')
    expect(search).toContain('searchableText')
    expect(pageDir).toContain('cli.mdx')
  })
})
```

- [ ] **Step 2: Run the generator test and verify it fails**

Run: `npm run test:run -- scripts/docs/generate-docs-artifacts.test.ts`
Expected: FAIL because the generator does not exist yet.

- [ ] **Step 3: Implement the generator and build scripts**

```ts
export async function generateDocsArtifacts({ cwd }: { cwd: string }) {
  const publishedDocs = await loadPublishedDocs({ cwd })
  const outputRoot = resolve(cwd, 'src/features/docs/generated')

  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(resolve(outputRoot, 'pages'), { recursive: true })

  for (const page of publishedDocs) {
    const pagePath = resolve(outputRoot, 'pages', page.version, page.locale, `${page.slug}.mdx`)
    await mkdir(dirname(pagePath), { recursive: true })
    await writeFile(pagePath, page.body, 'utf8')
  }

  await writeFile(resolve(outputRoot, 'docs-manifest.generated.ts'), emitManifest(publishedDocs))
  await writeFile(resolve(outputRoot, 'docs-search.generated.ts'), emitSearchIndex(publishedDocs))
  await writeFile(resolve(outputRoot, 'docs-page-modules.generated.ts'), `export const publicDocModules = import.meta.glob('./pages/**/*.mdx')\n`)

  return outputRoot
}
```

Add scripts and dependencies:

```json
{
  "scripts": {
    "docs:generate": "tsx scripts/docs/generate-docs-artifacts.ts",
    "build:public": "npm run docs:generate && vite build"
  }
}
```

Add:

- `express`
- `tsx`
- `@mdx-js/rollup`
- `supertest`
- `concurrently`

- [ ] **Step 4: Configure Vite to compile generated MDX pages and switch the reader**

```ts
import mdx from '@mdx-js/rollup'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [mdx(), react()],
})
```

Create `public-docs.ts`:

```ts
import { docsManifest } from '../generated/docs-manifest.generated'
import { docsSearchIndex } from '../generated/docs-search.generated'

export const getPublishedPages = () => docsManifest.pages
export const getPublishedSiteConfig = () => docsManifest.siteConfig
export const getPublishedSearchIndex = () => docsSearchIndex
```

Create `published-doc-renderer.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import { publicDocModules } from '../generated/docs-page-modules.generated'

export function PublishedDocRenderer({ modulePath }: { modulePath: string }) {
  const loader = publicDocModules[modulePath]
  const Content = lazy(loader as () => Promise<{ default: React.ComponentType }>)

  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  )
}
```

- [ ] **Step 5: Re-run the generator test and a production build**

Run: `npm run test:run -- scripts/docs/generate-docs-artifacts.test.ts`
Expected: PASS

Run: `npm run docs:generate`
Expected: generated files appear under `src/features/docs/generated`

Run: `npm run build:public`
Expected: PASS with Vite compiling generated MDX pages for the published reader path.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts scripts/docs/generate-docs-artifacts.ts scripts/docs/generate-docs-artifacts.test.ts src/features/docs/content/public-docs.ts src/features/docs/components/published-doc-renderer.tsx src/features/docs/routes/reader-page.tsx src/features/docs/routes/helpers.ts src/features/docs/content/site-config.ts src/features/docs/generated
git commit -m "feat: generate build-time docs artifacts"
```

## Task 3: Stand Up The Node Docs Server And Filesystem Repositories

**Files:**
- Create: `server/index.ts`
- Create: `server/app.ts`
- Create: `server/config.ts`
- Create: `server/services/content-paths.ts`
- Create: `server/services/draft-repository.ts`
- Create: `server/services/system-repository.ts`
- Create: `server/routes/docs-routes.ts`
- Create: `server/test/test-content-root.ts`
- Create: `server/test/draft-repository.test.ts`
- Create: `server/test/docs-api.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write the failing repository test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createDraftRepository } from '../services/draft-repository'
import { createTestContentRoot } from './test-content-root'

describe('draft repository', () => {
  it('writes and reloads draft files under content/drafts', async () => {
    const root = await createTestContentRoot()
    const repo = createDraftRepository({ contentRoot: root })

    await repo.save({
      title: 'CLI Guide',
      summary: 'Draft',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      section: 'Guides',
      tags: ['cli'],
      body: '# Draft CLI Guide',
      translationKey: 'cli',
      translationStatus: 'current',
    })

    const stored = await repo.get({ locale: 'en', version: 'v2.0', slug: 'guides/cli' })
    expect(stored?.body).toContain('# Draft CLI Guide')
  })
})
```

- [ ] **Step 2: Write the failing API test**

```ts
// @vitest-environment node
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApp } from '../app'
import { createTestContentRoot } from './test-content-root'

describe('docs api', () => {
  it('saves drafts through PUT /api/docs/drafts/:locale/:version/*slug', async () => {
    const root = await createTestContentRoot()
    const app = createApp({ contentRoot: root })

    const response = await request(app)
      .put('/api/docs/drafts/en/v2.0/guides/cli')
      .send({
        title: 'CLI Guide',
        summary: 'Draft',
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        section: 'Guides',
        tags: ['cli'],
        body: '# Draft CLI Guide',
        translationKey: 'cli',
        translationStatus: 'current',
      })

    expect(response.status).toBe(200)
    expect(response.body.draft.slug).toBe('guides/cli')
  })
})
```

- [ ] **Step 3: Run the server tests and verify they fail**

Run: `npm run test:run -- server/test/draft-repository.test.ts server/test/docs-api.test.ts`
Expected: FAIL because the `server/` modules do not exist yet.

- [ ] **Step 4: Implement repositories for drafts and system metadata**

```ts
export function createDraftRepository({ contentRoot }: { contentRoot: string }) {
  return {
    async get(key: DocKey) {
      const path = resolve(contentRoot, docFilePath({ scope: 'draft', ...key }))
      const source = await readOptionalFile(path)
      return source ? parseDocFile(path, source).page : undefined
    },
    async save(draft: DraftDocInput) {
      const path = resolve(contentRoot, docFilePath({ scope: 'draft', ...draft }))
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, serializeDocFile({ ...draft, order: 999, status: 'draft' }))
      return this.get(draft)
    },
  }
}
```

- [ ] **Step 5: Implement the Express app and docs routes**

```ts
import express from 'express'

export function createApp(config: AppConfig) {
  const app = express()
  app.use(express.json())
  app.use('/api/docs', createDocsRouter(config))
  return app
}
```

```ts
router.put('/drafts/:locale/:version/*slug', async (req, res) => {
  const draft = await draftRepository.save({ ...req.body, slug: req.params.slug })
  res.json({ draft })
})
```

- [ ] **Step 6: Add server scripts and re-run the tests**

Add:

```json
{
  "scripts": {
    "server:dev": "tsx watch server/index.ts",
    "server:start": "tsx server/index.ts"
  }
}
```

Run: `npm run test:run -- server/test/draft-repository.test.ts server/test/docs-api.test.ts`
Expected: PASS for draft repository and API tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json server/index.ts server/app.ts server/config.ts server/services/content-paths.ts server/services/draft-repository.ts server/services/system-repository.ts server/routes/docs-routes.ts server/test/test-content-root.ts server/test/draft-repository.test.ts server/test/docs-api.test.ts
git commit -m "feat: add filesystem-backed docs server"
```

## Task 4: Implement Safe Publish Queue, Staging Build, And Public Build Promotion

**Files:**
- Create: `server/services/public-build-repository.ts`
- Create: `server/services/build-queue.ts`
- Create: `server/services/publish-service.ts`
- Create: `server/test/publish-service.test.ts`
- Modify: `server/app.ts`
- Modify: `server/routes/docs-routes.ts`
- Modify: `content/system/build-state.json`
- Modify: `package.json`

- [ ] **Step 1: Write the failing publish-service test**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { createPublishService } from '../services/publish-service'
import { createTestContentRoot } from './test-content-root'

describe('publish service', () => {
  it('promotes a new public build only after the staged rebuild succeeds', async () => {
    const root = await createTestContentRoot()
    const build = vi.fn().mockResolvedValue({ buildId: 'build-002', outDir: '.runtime/public/builds/build-002' })
    const publishService = createPublishService({ contentRoot: root, runPublicBuild: build })

    const result = await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    expect(result.status).toBe('queued')
    await publishService.waitForIdle()
    expect(await publishService.getStatus()).toMatchObject({
      status: 'ready',
      currentBuildId: 'build-002',
    })
  })
})
```

- [ ] **Step 2: Run the publish-service test and verify it fails**

Run: `npm run test:run -- server/test/publish-service.test.ts`
Expected: FAIL because the queue and publish service do not exist yet.

- [ ] **Step 3: Implement a one-at-a-time build queue**

```ts
export function createBuildQueue(deps: BuildQueueDeps) {
  let active: Promise<void> | null = null

  return {
    async enqueue(job: PublishJob) {
      deps.systemRepository.markQueued(job)
      if (!active) {
        active = runLoop().finally(() => {
          active = null
        })
      }
      return { status: 'queued' as const }
    },
  }
}
```

- [ ] **Step 4: Implement staging, build execution, and promotion**

```ts
const buildId = new Date().toISOString().replace(/[:.]/g, '-')
const stagedWorkspaceRoot = resolve(runtimeRoot, 'workspaces', buildId)
const stagedContentRoot = resolve(stagedWorkspaceRoot, 'content')
const outDir = resolve(runtimeRoot, 'public', 'builds', buildId)

await copyBuildWorkspace(repoRoot, stagedWorkspaceRoot, ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'public', 'src', 'content'])
await applyDraftToPublishedTree(stagedContentRoot, draft)
await generateDocsArtifacts({ cwd: stagedWorkspaceRoot })
await runPublicBuild({ cwd: stagedWorkspaceRoot, outDir })
await publicBuildRepository.promote({ buildId, outDir })
await systemRepository.markReady({ buildId })
```

Use the state-file-based promote model:

- build into `.runtime/public/builds/<buildId>`
- persist `currentBuildId` in `content/system/build-state.json`
- resolve static files from the current build id at request time

- [ ] **Step 5: Expose publish and status routes**

```ts
router.post('/publish/:locale/:version/*slug', async (req, res) => {
  const result = await publishService.publish({
    locale: req.params.locale,
    version: req.params.version,
    slug: req.params.slug,
    actor: req.body.actor,
  })
  res.status(202).json(result)
})

router.get('/publish-status', async (_req, res) => {
  res.json(await publishService.getStatus())
})
```

- [ ] **Step 6: Re-run publish tests and a public build**

Run: `npm run test:run -- server/test/publish-service.test.ts`
Expected: PASS for ready and failed promotion cases.

Run: `npm run build:public`
Expected: PASS with generated docs artifacts and fresh public build output.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/services/public-build-repository.ts server/services/build-queue.ts server/services/publish-service.ts server/routes/docs-routes.ts server/app.ts server/test/publish-service.test.ts content/system/build-state.json
git commit -m "feat: add staged publish and build promotion"
```

## Task 5: Replace Local Browser Docs State With API-Backed Admin State

**Files:**
- Create: `src/features/docs/state/docs-api.ts`
- Create: `src/features/docs/state/docs-store.test.tsx`
- Modify: `src/features/docs/state/docs-store.tsx`
- Modify: `src/features/docs/routes/admin-page.tsx`
- Modify: `src/app.tsx`
- Modify: `src/features/docs/components/mdx-renderer.tsx`

- [ ] **Step 1: Write the failing store test**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DocsProvider, useDocsStore } from './docs-store'

vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.endsWith('/api/docs/drafts')) {
    return new Response(JSON.stringify({ drafts: [] }))
  }
  if (url.endsWith('/api/docs/publish-status')) {
    return new Response(JSON.stringify({ status: 'idle' }))
  }
  return new Response(JSON.stringify({ redirects: [], media: [], publishHistory: [] }))
}))

function Probe() {
  const store = useDocsStore()
  return <div>{store.publishStatus.status}</div>
}

describe('DocsProvider', () => {
  it('loads API-backed admin state and keeps published pages from generated artifacts', async () => {
    render(
      <DocsProvider>
        <Probe />
      </DocsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('idle')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `npm run test:run -- src/features/docs/state/docs-store.test.tsx`
Expected: FAIL because the provider still assumes `localStorage`-owned state and has no `publishStatus`.

- [ ] **Step 3: Implement a small REST client in `docs-api.ts`**

```ts
export async function fetchDrafts() {
  const response = await fetch('/api/docs/drafts')
  return parseJson<{ drafts: DraftDocInput[] }>(response)
}

export async function saveDraft(draft: DraftDocInput) {
  const response = await fetch(`/api/docs/drafts/${draft.locale}/${draft.version}/${draft.slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
  return parseJson<{ draft: DraftDocInput }>(response)
}

export async function publishDraftRequest(input: PublishRequest) {
  const response = await fetch(`/api/docs/publish/${input.locale}/${input.version}/${input.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson<PublishStatus>(response)
}
```

- [ ] **Step 4: Refactor `DocsProvider` to combine generated reader data with API-loaded admin state**

```tsx
const publishedPages = getPublishedPages()
const [drafts, setDrafts] = useState<DraftDocInput[]>([])
const [publishStatus, setPublishStatus] = useState<PublishStatus>({ status: 'idle' })

useEffect(() => {
  void Promise.all([fetchDrafts(), fetchRedirects(), fetchMedia(), fetchPublishHistory(), fetchPublishStatus()])
    .then(([draftsResult, redirectsResult, mediaResult, historyResult, statusResult]) => {
      setDrafts(draftsResult.drafts)
      setRedirects(redirectsResult.redirects)
      setMedia(mediaResult.media)
      setPublishRecords(historyResult.publishHistory)
      setPublishStatus(statusResult)
    })
}, [])
```

Use generated data for:

- published pages
- published site config
- published search index

Remove docs `localStorage` persistence entirely.

- [ ] **Step 5: Update `AdminPage` to show API-backed publish status and keep preview-only runtime MDX**

```tsx
<Badge color={publishStatus.status === 'failed' ? 'red' : 'blue'}>
  {publishStatus.status}
</Badge>
```

On `Publish`:

- call the API instead of mutating in-memory published pages
- refresh `/api/docs/publish-status`
- leave `MdxRenderer` in place for draft preview only

- [ ] **Step 6: Re-run the store test and docs engine tests**

Run: `npm run test:run -- src/features/docs/state/docs-store.test.tsx src/features/docs/lib/docs-engine.test.ts`
Expected: PASS for the provider test and existing docs engine tests.

- [ ] **Step 7: Commit**

```bash
git add src/app.tsx src/features/docs/state/docs-api.ts src/features/docs/state/docs-store.tsx src/features/docs/state/docs-store.test.tsx src/features/docs/routes/admin-page.tsx src/features/docs/components/mdx-renderer.tsx
git commit -m "refactor: move admin docs state to api"
```

## Task 6: Final Wiring, Regression Coverage, And End-To-End Verification

**Files:**
- Modify: `package.json`
- Modify: `src/features/docs/routes/docs-app.tsx`
- Modify: `src/features/docs/routes/reader-page.tsx`
- Modify: `src/features/docs/state/docs-store.tsx`
- Modify: `server/index.ts`
- Modify: `server/app.ts`
- Test: `src/features/docs/content/doc-source.test.ts`
- Test: `scripts/docs/generate-docs-artifacts.test.ts`
- Test: `server/test/draft-repository.test.ts`
- Test: `server/test/docs-api.test.ts`
- Test: `server/test/publish-service.test.ts`
- Test: `src/features/docs/state/docs-store.test.tsx`

- [ ] **Step 1: Add a single top-level workflow for local development**

```json
{
  "scripts": {
    "dev:web": "npm run docs:generate && vite",
    "dev": "npm run docs:generate && concurrently \"npm:server:dev\" \"vite\""
  }
}
```

Keep the server as the deployed entry point, but keep Vite dev available for frontend iteration.

- [ ] **Step 2: Add a smoke test for publish status and promoted build serving**

Server-side smoke assertion:

```ts
const statusResponse = await request(app).get('/api/docs/publish-status')
expect(statusResponse.status).toBe(200)
expect(statusResponse.body).toHaveProperty('status')
```

Add a second assertion that the server resolves static assets from the build id stored in `content/system/build-state.json`.

- [ ] **Step 3: Run the full automated verification suite**

Run: `npm run test:run`
Expected: PASS with no failing docs, server, or state tests.

Run: `npm run docs:generate`
Expected: PASS with fresh generated docs artifacts.

Run: `npm run build`
Expected: PASS for the default production build.

Run: `npm run build:public`
Expected: PASS for the server-triggered public build path.

- [ ] **Step 4: Perform the manual publish smoke test**

1. Start the server: `npm run server:dev`
2. Start the frontend: `npm run dev:web`
3. Open `/admin`
4. Save a draft for `guides/cli`
5. Publish the draft
6. Confirm `/api/docs/publish-status` moves through `queued` -> `building` -> `ready`
7. Reload the public page and verify the published content is visible
8. Force one broken MDX publish and verify the public site still serves the last good build while status moves to `failed`

- [ ] **Step 5: Remove dead browser-only published docs code**

Delete or stop using:

- browser docs `localStorage` persistence
- raw published-doc loading via `import.meta.glob(..., query: '?raw')`
- runtime `evaluate()` for published reader rendering

Keep runtime `evaluate()` only for draft preview in `AdminPage`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/docs/routes/docs-app.tsx src/features/docs/routes/reader-page.tsx src/features/docs/state/docs-store.tsx server/index.ts server/app.ts
git commit -m "feat: finish build-time docs pipeline"
```
