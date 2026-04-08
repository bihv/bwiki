import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DOCS_STORAGE_KEYS } from '../content/site-config'
import type { DocPage, PublishRecord, RedirectRule, SiteConfig } from '../lib/docs-engine'
import type { DraftDocInput } from '../lib/docs-engine'
import { createDraftFromPage } from '../routes/helpers'

interface MediaAsset {
  id: string
  title: string
  url: string
  kind: 'image' | 'video' | 'file'
}

const { seedPage } = vi.hoisted(() => ({
  seedPage: {
    id: 'v2.0:en:getting-started/published-seed',
    title: 'Published Seed',
    summary: 'Seed summary',
    locale: 'en',
    version: 'v2.0',
    slug: 'getting-started/published-seed',
    section: 'Getting Started',
    order: 1,
    status: 'published',
    tags: ['seed'],
    updatedAt: '2026-04-08T00:00:00.000Z',
    sourcePath: 'content/docs/v2.0/en/getting-started/published-seed.mdx',
    body: '# Published Seed',
    translationKey: 'published-seed',
    translationStatus: 'current',
  } satisfies DocPage,
}))

vi.mock('../content/doc-loader', () => ({
  loadSeedDocs: vi.fn(() => [seedPage]),
  mergePublishedPages: vi.fn(() => [seedPage]),
}))

import { DocsProvider, useDocsStore } from './docs-store'

interface MockResponse {
  body: unknown
  status?: number
}

const draftPage: DocPage = {
  id: 'v2.0:en:guides/api-draft',
  title: 'API Draft',
  summary: 'Draft from API',
  locale: 'en',
  version: 'v2.0',
  slug: 'guides/api-draft',
  section: 'Guides',
  order: 2,
  status: 'draft',
  tags: ['api'],
  updatedAt: '2026-04-08T10:00:00.000Z',
  sourcePath: 'content/drafts/v2.0/en/guides/api-draft.mdx',
  body: '# API Draft',
  translationKey: 'api-draft',
  translationStatus: 'current',
}

const updatedDraftPage: DocPage = {
  ...draftPage,
  title: 'Updated API Draft',
  summary: 'Updated draft from API',
  body: '# Updated API Draft',
  updatedAt: '2026-04-08T12:34:56.000Z',
}

const publishedApiPage: DocPage = {
  ...seedPage,
  title: 'Published From API',
  summary: 'Published summary from API',
  body: '# Published From API',
  updatedAt: '2026-04-08T11:30:00.000Z',
}

const redirects: RedirectRule[] = [{ from: 'old-draft', to: 'guides/api-draft', locale: 'en', version: 'v2.0' }]
const media: MediaAsset[] = [{ id: 'asset-api', title: 'API Diagram', url: '/media/api.png', kind: 'image' }]
const publishHistory: PublishRecord[] = [
  {
    actor: 'Admin Operator',
    actorId: 'admin-operator',
    role: 'admin',
    locale: 'en',
    version: 'v2.0',
    targetSlug: 'guides/api-draft',
    timestamp: '2026-04-08T11:00:00.000Z',
    result: 'published',
  },
]
const siteConfig: SiteConfig = {
  locales: [
    { key: 'en', label: 'English', isDefault: true },
    { key: 'vi', label: 'Tieng Viet' },
  ],
  versions: [
    { key: 'v2.0', label: '2.0', isLatest: true, isStable: true },
    { key: 'v1.0', label: '1.0', isDeprecated: true },
  ],
  componentRegistry: ['Callout'],
  redirects: [{ from: 'config-redirect', to: 'getting-started/published-seed', locale: 'en', version: 'v2.0' }],
}
const authDisabledSession = {
  authEnabled: false,
  authenticated: true,
  username: null,
}
const authEnabledSession = {
  authEnabled: true,
  authenticated: true,
  username: 'admin',
}
const authRequiredSession = {
  authEnabled: true,
  authenticated: false,
  username: null,
}

function keyFor(url: string, method = 'GET') {
  return `${method.toUpperCase()} ${url}`
}

function jsonResponse({ body, status = 200 }: MockResponse) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function installFetchMock(handlers: Record<string, MockResponse[]>) {
  const normalizedHandlers = { ...handlers }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'
    const handlerKey = keyFor(url, method)
    const queue = normalizedHandlers[handlerKey]

    if ((!queue || queue.length === 0) && handlerKey === keyFor('/api/docs/auth/session')) {
      return jsonResponse({ body: authDisabledSession })
    }

    if (!queue || queue.length === 0) {
      throw new Error(`Unhandled fetch: ${handlerKey}`)
    }

    return jsonResponse(queue.shift()!)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function StoreProbe() {
  const store = useDocsStore()
  const publishStatus = (store as unknown as { publishStatus?: { status: string } }).publishStatus
  const [activeDraft] = useState({
    title: 'Updated API Draft',
    summary: 'Updated draft from API',
    locale: 'en',
    version: 'v2.0',
    slug: 'guides/api-draft',
    section: 'Guides',
    tags: ['api', 'updated'],
    body: '# Updated API Draft',
    translationKey: 'api-draft',
    translationStatus: 'current' as const,
  })

  return (
    <div>
      <div data-testid="auth-enabled">{String(store.authEnabled)}</div>
      <div data-testid="auth-status">{store.authStatus}</div>
      <div data-testid="auth-username">{store.authUsername ?? 'missing'}</div>
      <div data-testid="pages">{store.pages.map((page) => page.title).join(', ')}</div>
      <div data-testid="drafts">{store.drafts.map((draft) => draft.title).join(', ')}</div>
      <div data-testid="redirects">{store.redirects.length}</div>
      <div data-testid="media">{store.media.length}</div>
      <div data-testid="history">{store.publishRecords.length}</div>
      <div data-testid="publish-status">{publishStatus?.status ?? 'missing'}</div>
      <div data-testid="locale-options">{store.localeOptions.map((locale) => locale.label).join(', ')}</div>
      <button onClick={() => void store.login({ username: 'admin', password: 'secret' })} type="button">
        Login Admin
      </button>
      <button onClick={() => void store.logout()} type="button">
        Logout Admin
      </button>
      <button onClick={() => void store.saveDraft(activeDraft)} type="button">
        Save Draft
      </button>
      <button onClick={() => void store.publish(activeDraft)} type="button">
        Publish Draft
      </button>
    </div>
  )
}

function RefreshProbe() {
  const store = useDocsStore()

  return (
    <button onClick={() => void store.refreshAdminState()} type="button">
      Refresh Admin State
    </button>
  )
}

function NavigateHomeProbe() {
  const navigate = useNavigate()

  return (
    <button onClick={() => navigate('/')} type="button">
      Go Home
    </button>
  )
}

function createDeferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function DraftEditorHarness() {
  const store = useDocsStore()
  const [selectedKey, setSelectedKey] = useState('new')
  const [draft, setDraft] = useState<DraftDocInput>(() => createDraftFromPage())

  useEffect(() => {
    if (selectedKey === 'new') {
      setDraft(createDraftFromPage())
      return
    }

    const [locale, version, ...slugParts] = selectedKey.split(':')
    const slug = slugParts.join(':')
    const selectedDraft = store.drafts.find((item) => item.locale === locale && item.version === version && item.slug === slug)
    const selectedPage = store.pages.find((item) => item.locale === locale && item.version === version && item.slug === slug)
    setDraft(createDraftFromPage(selectedDraft ?? selectedPage))
  }, [selectedKey])

  return (
    <div>
      <button onClick={() => setSelectedKey(`${draftPage.locale}:${draftPage.version}:${draftPage.slug}`)} type="button">
        Load Draft
      </button>
      <input
        aria-label="Editor Title"
        onChange={(event) => {
          const nextTitle = event.currentTarget.value
          setDraft((currentDraft) => ({ ...currentDraft, title: nextTitle }))
        }}
        value={draft.title}
      />
    </div>
  )
}

describe('DocsProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads admin state from the API, ignores localStorage docs data, and uses HTTP for save and publish', async () => {
    window.localStorage.setItem(
      DOCS_STORAGE_KEYS.drafts,
      JSON.stringify([
        {
          title: 'Local Draft',
          summary: 'local',
          locale: 'en',
          version: 'v2.0',
          slug: 'guides/local-draft',
          section: 'Guides',
          tags: [],
          body: '# Local Draft',
          translationKey: 'local-draft',
          translationStatus: 'current',
        },
      ]),
    )
    window.localStorage.setItem(DOCS_STORAGE_KEYS.redirects, JSON.stringify([{ from: 'local', to: 'draft' }]))
    window.localStorage.setItem(
      DOCS_STORAGE_KEYS.media,
      JSON.stringify([{ id: 'local-asset', title: 'Local Asset', url: '/local.png', kind: 'image' }]),
    )
    window.localStorage.setItem(
      DOCS_STORAGE_KEYS.publishRecords,
      JSON.stringify([
        {
          actor: 'Local Operator',
          actorId: 'local-operator',
          role: 'editor',
          locale: 'en',
          version: 'v2.0',
          targetSlug: 'guides/local-draft',
          timestamp: '2026-04-08T09:00:00.000Z',
          result: 'published',
        },
      ]),
    )

    const fetchMock = installFetchMock({
      [keyFor('/api/docs/drafts')]: [{ body: { drafts: [draftPage] } }],
      [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }],
      [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }],
      [keyFor('/api/docs/system/media')]: [{ body: { media } }],
      [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }],
      [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }],
      [keyFor('/api/docs/publish-status')]: [
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:00:00.000Z',
            error: null,
          },
        },
        {
          body: {
            status: 'queued',
            currentBuildId: 'build-2',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: '2026-04-08T12:05:00.000Z',
            updatedAt: '2026-04-08T12:05:00.000Z',
            error: null,
          },
        },
      ],
      [keyFor('/api/docs/drafts/en/v2.0/guides/api-draft', 'PUT')]: [{ body: { draft: updatedDraftPage } }],
      [keyFor('/api/docs/publish/en/v2.0/guides/api-draft', 'POST')]: [{ body: { status: 'queued' }, status: 202 }],
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <StoreProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('drafts')).toHaveTextContent('API Draft')
    })

    expect(screen.getByTestId('pages')).toHaveTextContent('Published From API')
    expect(screen.getByTestId('drafts')).not.toHaveTextContent('Local Draft')
    expect(screen.getByTestId('redirects')).toHaveTextContent('1')
    expect(screen.getByTestId('media')).toHaveTextContent('1')
    expect(screen.getByTestId('history')).toHaveTextContent('1')
    expect(screen.getByTestId('publish-status')).toHaveTextContent('ready')
    expect(screen.getByTestId('locale-options')).toHaveTextContent('English, Tieng Viet')

    await user.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => {
      expect(screen.getByTestId('drafts')).toHaveTextContent('Updated API Draft')
    })

    await user.click(screen.getByRole('button', { name: 'Publish Draft' }))

    await waitFor(() => {
      expect(screen.getByTestId('publish-status')).toHaveTextContent('queued')
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/docs/drafts/en/v2.0/guides/api-draft', expect.objectContaining({
      method: 'PUT',
    }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/docs/publish/en/v2.0/guides/api-draft',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          actor: {
            id: 'admin-operator',
            name: 'Admin Operator',
            role: 'admin',
          },
          expectedUpdatedAt: '2026-04-08T12:34:56.000Z',
        }),
      }),
    )
  })

  it('does not hydrate admin API state outside the admin route', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/']}>
        <DocsProvider>
          <StoreProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('pages')).toHaveTextContent('Published Seed')
    })

    expect(screen.getByTestId('drafts')).toBeEmptyDOMElement()
    expect(screen.getByTestId('publish-status')).toHaveTextContent('missing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an authenticated admin session before hydrating admin data', async () => {
    const fetchMock = installFetchMock({
      [keyFor('/api/docs/auth/session')]: [{ body: authRequiredSession }, { body: authEnabledSession }],
      [keyFor('/api/docs/auth/login', 'POST')]: [{ body: authEnabledSession }],
      [keyFor('/api/docs/auth/logout', 'POST')]: [{ body: authRequiredSession }],
      [keyFor('/api/docs/drafts')]: [{ body: { drafts: [draftPage] } }],
      [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }],
      [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }],
      [keyFor('/api/docs/system/media')]: [{ body: { media } }],
      [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }],
      [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }],
      [keyFor('/api/docs/publish-status')]: [
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:00:00.000Z',
            error: null,
          },
        },
      ],
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <StoreProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated')
    })

    expect(screen.getByTestId('auth-enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('drafts')).toBeEmptyDOMElement()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/docs/drafts')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Login Admin' }))

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated')
    })

    expect(screen.getByTestId('auth-username')).toHaveTextContent('admin')
    expect(screen.getByTestId('drafts')).toHaveTextContent('API Draft')

    await user.click(screen.getByRole('button', { name: 'Logout Admin' }))

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated')
    })

    expect(screen.getByTestId('drafts')).toBeEmptyDOMElement()
    expect(screen.getByTestId('publish-status')).toHaveTextContent('missing')
  })

  it('keeps queued publish successful when publish-status refresh fails', async () => {
    const fetchMock = installFetchMock({
      [keyFor('/api/docs/drafts')]: [{ body: { drafts: [draftPage] } }],
      [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }],
      [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }],
      [keyFor('/api/docs/system/media')]: [{ body: { media } }],
      [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }],
      [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }],
      [keyFor('/api/docs/publish-status')]: [
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:00:00.000Z',
            error: null,
          },
        },
        {
          body: {
            error: 'refresh failed',
          },
          status: 500,
        },
      ],
      [keyFor('/api/docs/publish/en/v2.0/guides/api-draft', 'POST')]: [{ body: { status: 'queued' }, status: 202 }],
    })

    function PublishProbe() {
      const store = useDocsStore()
      const [result, setResult] = useState('pending')
      const [activeDraft] = useState({
        title: 'Updated API Draft',
        summary: 'Updated draft from API',
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/api-draft',
        section: 'Guides',
        tags: ['api', 'updated'],
        body: '# Updated API Draft',
        translationKey: 'api-draft',
        translationStatus: 'current' as const,
      })

      return (
        <div>
          <div data-testid="publish-status">{store.publishStatus?.status ?? 'missing'}</div>
          <div data-testid="publish-result">{result}</div>
          <button
            onClick={() => {
              void store.publish(activeDraft).then((response) => {
                setResult(response.errors.length === 0 ? 'success' : response.errors.join(', '))
              })
            }}
            type="button"
          >
            Queue Publish
          </button>
        </div>
      )
    }

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <PublishProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('publish-status')).toHaveTextContent('ready')
    })

    await user.click(screen.getByRole('button', { name: 'Queue Publish' }))

    await waitFor(() => {
      expect(screen.getByTestId('publish-result')).toHaveTextContent('success')
    })

    expect(screen.getByTestId('publish-status')).toHaveTextContent('queued')
    expect(fetchMock).toHaveBeenCalledWith('/api/docs/publish/en/v2.0/guides/api-draft', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('preserves unsaved editor changes across admin refreshes until selection changes', async () => {
    installFetchMock({
      [keyFor('/api/docs/drafts')]: [
        { body: { drafts: [draftPage] } },
        {
          body: {
            drafts: [
              {
                ...draftPage,
                title: 'API Draft From Refresh',
                summary: 'Refreshed from API',
              },
            ],
          },
        },
      ],
      [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }, { body: { pages: [publishedApiPage] } }],
      [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }, { body: { redirects } }],
      [keyFor('/api/docs/system/media')]: [{ body: { media } }, { body: { media } }],
      [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }, { body: { publishHistory } }],
      [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }, { body: { siteConfig } }],
      [keyFor('/api/docs/publish-status')]: [
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:00:00.000Z',
            error: null,
          },
        },
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:01:00.000Z',
            error: null,
          },
        },
      ],
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <Routes>
            <Route
              element={
                <>
                  <DraftEditorHarness />
                  <RefreshProbe />
                </>
              }
              path="/admin"
            />
          </Routes>
        </DocsProvider>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Load Draft' }))

    const titleInput = await screen.findByLabelText('Editor Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Local Unsaved Title')

    await user.click(screen.getByRole('button', { name: 'Refresh Admin State' }))

    await waitFor(() => {
      expect(titleInput).toHaveValue('Local Unsaved Title')
    })
  })

  it('ignores in-flight admin responses after navigating away from /admin', async () => {
    const deferredSession = createDeferredResponse()

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? 'GET'
      const handlerKey = keyFor(url, method)

      switch (handlerKey) {
        case keyFor('/api/docs/auth/session'):
          return deferredSession.promise
        default:
          throw new Error(`Unhandled fetch: ${handlerKey}`)
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <Routes>
            <Route element={<NavigateHomeProbe />} path="/admin" />
            <Route element={<div>Home</div>} path="/" />
          </Routes>
          <StoreProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Go Home' }))

    deferredSession.resolve(jsonResponse({ body: authEnabledSession }))

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })

    expect(screen.getByTestId('drafts')).toBeEmptyDOMElement()
    expect(screen.getByTestId('redirects')).toHaveTextContent('0')
    expect(screen.getByTestId('publish-status')).toHaveTextContent('missing')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores saveDraft state updates after navigating away from /admin', async () => {
    const deferredSave = createDeferredResponse()
    const fetchMock = installFetchMock({
      [keyFor('/api/docs/drafts')]: [{ body: { drafts: [draftPage] } }],
      [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }],
      [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }],
      [keyFor('/api/docs/system/media')]: [{ body: { media } }],
      [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }],
      [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }],
      [keyFor('/api/docs/publish-status')]: [
        {
          body: {
            status: 'ready',
            currentBuildId: 'build-1',
            lastSuccessfulBuildId: 'build-1',
            queuedAt: null,
            updatedAt: '2026-04-08T12:00:00.000Z',
            error: null,
          },
        },
      ],
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? 'GET'
      const handlerKey = keyFor(url, method)

      if (handlerKey === keyFor('/api/docs/auth/session')) {
        return jsonResponse({ body: authDisabledSession })
      }

      if (handlerKey === keyFor('/api/docs/drafts/en/v2.0/guides/api-draft', 'PUT')) {
        return deferredSave.promise
      }

      const queue = {
        [keyFor('/api/docs/drafts')]: [{ body: { drafts: [draftPage] } }],
        [keyFor('/api/docs/pages')]: [{ body: { pages: [publishedApiPage] } }],
        [keyFor('/api/docs/system/redirects')]: [{ body: { redirects } }],
        [keyFor('/api/docs/system/media')]: [{ body: { media } }],
        [keyFor('/api/docs/system/publish-history')]: [{ body: { publishHistory } }],
        [keyFor('/api/docs/system/site-config')]: [{ body: { siteConfig } }],
        [keyFor('/api/docs/publish-status')]: [
          {
            body: {
              status: 'ready',
              currentBuildId: 'build-1',
              lastSuccessfulBuildId: 'build-1',
              queuedAt: null,
              updatedAt: '2026-04-08T12:00:00.000Z',
              error: null,
            },
          },
        ],
      }[handlerKey]

      if (!queue || queue.length === 0) {
        throw new Error(`Unhandled fetch: ${handlerKey}`)
      }

      return jsonResponse(queue.shift()!)
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <DocsProvider>
          <Routes>
            <Route element={<NavigateHomeProbe />} path="/admin" />
            <Route element={<div>Home</div>} path="/" />
          </Routes>
          <StoreProbe />
        </DocsProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('drafts')).toHaveTextContent('API Draft')
    })

    await user.click(screen.getByRole('button', { name: 'Save Draft' }))
    await user.click(screen.getByRole('button', { name: 'Go Home' }))

    deferredSave.resolve(jsonResponse({ body: { draft: updatedDraftPage } }))

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })

    expect(screen.getByTestId('drafts')).toBeEmptyDOMElement()
    expect(screen.getByTestId('publish-status')).toHaveTextContent('missing')
  })
})
