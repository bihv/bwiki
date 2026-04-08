import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { DocPage } from '../lib/docs-engine'
import { PublishedDocRenderer } from './published-doc-renderer'

vi.mock('@mdx-js/mdx', () => ({
  evaluate: vi.fn(() => {
    throw new Error('runtime MDX evaluate should not be used for published docs')
  }),
}))

vi.mock('../generated/docs-page-modules.generated', async () => {
  const React = await import('react')

  return {
    generatedPageModules: {
      'v9.0:en:getting-started/introduction': () =>
        Promise.resolve({
          default: () => React.createElement('article', null, 'Compiled generated page'),
        }),
    },
  }
})

function renderPublishedDocRenderer(page: Pick<DocPage, 'id'>) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <PublishedDocRenderer page={page} />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('PublishedDocRenderer', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders the compiled generated page module for a published page', async () => {
    renderPublishedDocRenderer({ id: 'v9.0:en:getting-started/introduction' })

    expect(await screen.findByText('Compiled generated page')).toBeInTheDocument()
  })

  it('renders a fallback when no generated page module exists', () => {
    renderPublishedDocRenderer({ id: 'v9.0:en:missing/page' })

    expect(screen.getByText('Published MDX module missing')).toBeInTheDocument()
    expect(screen.getByText('No generated module was registered for v9.0:en:missing/page.')).toBeInTheDocument()
  })
})
