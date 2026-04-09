import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsProvider } from '../state/docs-store'
import type { DocPage, PublishRecord, RedirectRule, SiteConfig } from '../lib/docs-engine'
import { AdminPage } from './admin-page'

const publishedPage: DocPage = {
  id: 'v2.0:en:getting-started/introduction',
  title: 'Introduction',
  summary: 'Published summary',
  locale: 'en',
  version: 'v2.0',
  slug: 'getting-started/introduction',
  section: 'Getting Started',
  order: 1,
  status: 'published',
  tags: ['intro'],
  updatedAt: '2026-04-08T11:30:00.000Z',
  sourcePath: 'content/docs/v2.0/en/getting-started/introduction.mdx',
  body: '# Introduction',
  translationKey: 'introduction',
  translationStatus: 'current',
}

const redirects: RedirectRule[] = []
const publishHistory: PublishRecord[] = []
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
  redirects,
}

function keyFor(url: string, method = 'GET') {
  return `${method.toUpperCase()} ${url}`
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function installFetchMock() {
  const handlers: Record<string, unknown> = {
    [keyFor('/api/docs/auth/session')]: {
      authEnabled: false,
      authenticated: true,
      username: null,
    },
    [keyFor('/api/docs/drafts')]: { drafts: [] },
    [keyFor('/api/docs/pages')]: { pages: [publishedPage] },
    [keyFor('/api/docs/system/redirects')]: { redirects },
    [keyFor('/api/docs/system/media')]: { media: [] },
    [keyFor('/api/docs/system/publish-history')]: { publishHistory },
    [keyFor('/api/docs/system/site-config')]: { siteConfig },
    [keyFor('/api/docs/publish-status')]: {
      status: 'ready',
      currentBuildId: 'build-1',
      lastSuccessfulBuildId: 'build-1',
      queuedAt: null,
      updatedAt: '2026-04-08T12:00:00.000Z',
      error: null,
    },
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'
    const handler = handlers[keyFor(url, method)]

    if (!handler) {
      throw new Error(`Unhandled fetch: ${keyFor(url, method)}`)
    }

    return jsonResponse(handler)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAdminEditor() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/admin/editor?source=published&locale=en&version=v2.0&slug=getting-started/introduction']}>
        <DocsProvider>
          <AdminPage />
        </DocsProvider>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('AdminPage editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
    installFetchMock()
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
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps controlled text input edits instead of resetting from route selection', async () => {
    const user = userEvent.setup()
    renderAdminEditor()

    const titleInput = await screen.findByRole('textbox', { name: 'Title' })
    await user.clear(titleInput)
    await user.type(titleInput, 'Fresh introduction')

    await waitFor(() => {
      expect(titleInput).toHaveValue('Fresh introduction')
    })
  })

  it('allows opening and selecting editor dropdown values without crashing', async () => {
    const user = userEvent.setup()
    renderAdminEditor()

    await screen.findByRole('heading', { name: 'Introduction' })

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.click(screen.getByRole('combobox', { name: 'Locale' }))
    await user.click(await screen.findByRole('option', { name: 'Tieng Viet' }))

    await waitFor(() => {
      expect(screen.getByText(/Tieng Viet · 2.0/)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Introduction' })).toBeInTheDocument()
  })

  it('renders admin header actions together with the editor workspace', async () => {
    renderAdminEditor()

    await screen.findByRole('heading', { name: 'Introduction' })

    expect(screen.getByRole('heading', { name: 'Editorial workspace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle color scheme' })).toBeInTheDocument()
  })
})
