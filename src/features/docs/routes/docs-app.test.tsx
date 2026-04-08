import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsProvider } from '../state/docs-store'
import { DocsApp } from './docs-app'

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

describe('DocsApp', () => {
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

  it('redirects /admin to /admin/login when admin auth is enabled and no session exists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? 'GET'

      if (`${method.toUpperCase()} ${url}` === keyFor('/api/docs/auth/session')) {
        return jsonResponse({
          authEnabled: true,
          authenticated: false,
          username: null,
        })
      }

      throw new Error(`Unhandled fetch: ${method.toUpperCase()} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <DocsProvider>
            <DocsApp />
          </DocsProvider>
        </MemoryRouter>
      </MantineProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/docs/auth/session', expect.anything())
  })
})
