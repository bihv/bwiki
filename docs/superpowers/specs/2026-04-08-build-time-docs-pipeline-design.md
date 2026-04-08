# Build-Time Docs Pipeline Design

## Goal

Refactor the current browser-first docs demo into a real build-time docs pipeline where:

- published docs are file-backed and compiled into static build artifacts
- unpublished drafts are persisted on the server filesystem
- admin actions go through a Node API instead of `localStorage`
- `Publish` can trigger a background rebuild so the updated docs become visible to all readers after a successful promote

## Current State

The current implementation mixes published content, draft state, and rendering concerns inside the frontend:

- [doc-loader.ts](/D:/projects/bibi/bwiki/src/features/docs/content/doc-loader.ts) loads raw MDX into the browser with `import.meta.glob(..., query: '?raw')`
- [docs-store.tsx](/D:/projects/bibi/bwiki/src/features/docs/state/docs-store.tsx) merges seed pages with browser `localStorage` overrides
- [mdx-renderer.tsx](/D:/projects/bibi/bwiki/src/features/docs/components/mdx-renderer.tsx) evaluates MDX at runtime in the client
- redirects, media, publish records, and drafts are demo-only browser state

This is useful as a prototype, but it is not a build-time pipeline and it cannot support real multi-user editing or shared publish behavior.

## Chosen Architecture

Keep the existing Vite + React application and add a dedicated Node server in the same repository.

The Vite app remains responsible for UI.
The Node server becomes the control plane for:

- draft persistence
- publish orchestration
- redirects, media, and audit persistence
- build queue and publish status
- promotion of the last known good public build

The project will not migrate to Next.js in this refactor. The primary problem is filesystem-backed content management and controlled rebuild/promotion, not SSR or framework routing.

## Storage Boundaries

### Published Content

Published docs live in:

- `content/docs/<version>/<locale>/<slug>.mdx`

These files are the source of truth for the public docs graph consumed by the build pipeline.

### Draft Content

Unpublished drafts live in:

- `content/drafts/<version>/<locale>/<slug>.mdx`

Drafts are:

- persisted on the server filesystem
- visible to all editors using the same server
- not committed to git as part of normal draft save behavior

### Operational Metadata

Operational files live in:

- `content/system/site-config.json`
- `content/system/redirects.json`
- `content/system/media.json`
- `content/system/publish-history.json`
- optionally `content/system/build-state.json` for persisted queue/status metadata

### Storage Assumptions

This design requires persistent writable storage on the server for:

- `content/drafts`
- `content/docs`
- `content/system`
- the promoted public build output

If deploys use ephemeral filesystem storage, drafts and published changes can be lost during restart or redeploy. If multiple app instances are introduced later, they must share the same writable volume or the storage model must be revisited.

## Build-Time Public Pipeline

The public reader path becomes fully build-time for published content.

### Build Inputs

The generator reads:

- `content/docs`
- `content/system`

It does not read `content/drafts`.

### Build Outputs

The build pipeline generates a docs artifact bundle containing:

- a manifest of pages and metadata
- navigation data
- a search index
- a page-to-module map for published MDX modules
- a build identifier and timestamp

The Vite build compiles published MDX into React modules ahead of time. The public reader resolves metadata from generated artifacts and lazy-loads precompiled page modules instead of evaluating raw MDX strings in the browser.

### Runtime Public Reader

The public reader:

- does not use `import.meta.glob(... ?raw)` for published content
- does not use runtime `evaluate()` for published page rendering
- only renders the currently promoted build output

This keeps published docs deterministic, faster to load, and independent of browser-only content parsing.

## Admin Runtime Model

The admin editor moves from browser-local state to API-backed state.

### Admin Data Sources

The admin UI fetches:

- draft lists and draft details from the Node API
- redirects from the Node API
- media entries from the Node API
- publish history from the Node API
- publish/build status from the Node API

### Draft Preview

Draft preview remains runtime-rendered.

The current [mdx-renderer.tsx](/D:/projects/bibi/bwiki/src/features/docs/components/mdx-renderer.tsx) behavior can be retained for draft preview only, because drafts do not exist in the public build until publish succeeds and a rebuild is promoted.

This intentionally creates two rendering paths:

- published docs: build-time compiled
- draft preview: runtime evaluated

That split is acceptable and preferred because it keeps the public path simple while preserving flexible editing previews.

## Server Responsibilities

Add a `server/` area in the repository for a Node service that owns:

- draft CRUD
- publish requests
- redirect/media CRUD
- publish history reads
- build queue state
- serving or proxying the promoted public frontend build

### Minimum API Surface

The exact routes may change, but the server must cover these capabilities:

- `GET /api/docs/drafts`
- `GET /api/docs/drafts/:locale/:version/*slug`
- `PUT /api/docs/drafts/:locale/:version/*slug`
- `POST /api/docs/publish/:locale/:version/*slug`
- `GET /api/docs/publish-status`
- `GET /api/docs/redirects`
- `PUT /api/docs/redirects`
- `GET /api/docs/media`
- `PUT /api/docs/media`
- `GET /api/docs/publish-history`

## Publish Semantics

`Save draft` and `Publish` are intentionally different operations.

### Save Draft

`Save draft`:

- validates basic request shape
- writes or replaces the draft file in `content/drafts`
- does not change the public docs graph
- does not trigger a public build

### Publish

`Publish`:

- loads the draft from `content/drafts`
- validates frontmatter, component whitelist, and internal links
- applies the draft to the published content set
- updates operational metadata as needed
- enqueues a background rebuild
- only exposes the change publicly after rebuild succeeds and the new build is promoted

The user-visible meaning of `Publish` becomes:

`save content -> validate -> rebuild -> promote if successful`

## Rebuild And Promotion Model

The rebuild process must be safe under failure.

### Required Guarantees

- only one rebuild runs at a time
- queued publishes are visible via status
- the public site always serves a last known good build
- failed rebuilds do not partially replace the public site
- build promotion is atomic from the reader's perspective

### Recommended Flow

1. Accept publish request.
2. Create or update staging content state.
3. Run validation against the staged published tree.
4. Generate docs artifacts from staged content.
5. Run the frontend/public build against staged artifacts.
6. If the build succeeds, atomically promote staged source state and staged public output.
7. If the build fails, keep the currently promoted public output and report `failed`.

This avoids the dangerous state where published source files are changed but the public site cannot build successfully.

### Publish Status

The system exposes publish/build status values:

- `queued`
- `building`
- `ready`
- `failed`

The admin UI should surface these states clearly.

## Concurrency And Conflicts

The system must prevent silent overwrite of concurrent editor changes.

### Minimum Conflict Rule

The server rejects a publish when the client is publishing against a stale base version of the draft or the currently persisted file has changed since the editor loaded it.

Acceptable initial implementations include:

- comparing `updatedAt`
- comparing file modified time
- comparing a server-issued revision token

### Build Queue Rule

Only one rebuild may execute at a time.

If several publishes happen close together, the queue may coalesce them into a single subsequent rebuild as long as the final build contains every accepted publish.

## Validation Rules

The existing validation concepts remain, but they move server-side for draft save and publish.

Required validations:

- frontmatter schema correctness
- slug/path safety
- component whitelist enforcement
- internal doc link validity against published docs
- locale/version existence
- path resolution safety to prevent writes outside content roots

Validation must happen before a publish job enters the rebuild pipeline.

## Deployment Model

The preferred deployment shape is:

- one Node server process
- one persistent writable content volume
- one promoted public build directory served by that Node process or a colocated reverse proxy

This design assumes a stateful deployment. It is not intended for purely static hosting.

## Out Of Scope

The following are explicitly out of scope for this refactor:

- migrating the app to Next.js
- full role-based auth
- git commit automation for drafts or published docs
- multi-instance distributed locking
- unpublish/delete workflow
- per-save draft revision history
- CI-based remote build orchestration

These can be added later once the file-backed build-time pipeline is stable.

## Migration Outline

### Phase 1

- introduce filesystem-backed draft and metadata storage
- replace frontend `localStorage` docs state with API-backed state

### Phase 2

- add generator for published docs artifacts
- move public reader onto generated manifest/search/module-map inputs

### Phase 3

- add publish queue, staging build, and atomic promotion
- expose publish status in the admin UI

### Phase 4

- remove obsolete runtime-only published docs loading paths
- keep runtime MDX evaluation only for draft preview

## Success Criteria

This refactor is successful when:

- drafts are persisted server-side and shared across clients on the same server
- published docs are no longer sourced from browser `localStorage`
- the public reader renders only build-generated published content
- `Publish` triggers a rebuild workflow instead of merely mutating client state
- failed rebuilds do not break the public site
- editors can tell whether a publish is queued, building, ready, or failed
