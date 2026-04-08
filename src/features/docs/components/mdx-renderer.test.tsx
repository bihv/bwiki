import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const evaluateMock = vi.hoisted(() => vi.fn())

vi.mock('@mdx-js/mdx', () => ({
  evaluate: evaluateMock,
}))

import { MdxRenderer } from './mdx-renderer'

function renderWithMantine(source: string) {
  return render(
    <MantineProvider>
      <MdxRenderer source={source} />
    </MantineProvider>,
  )
}

describe('MdxRenderer', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    evaluateMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('blocks raw HTML tags before evaluation', async () => {
    renderWithMantine(`# Unsafe\n\n<img src="x" onerror="alert(1)" />`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks raw HTML/JSX tags.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks unsafe component attributes before evaluation', async () => {
    renderWithMantine(`<ExternalEmbed src="javascript:alert(1)" />`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe URL-like attribute "src".')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks markdown javascript links before evaluation', async () => {
    renderWithMantine(`[click me](javascript:alert(1))`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe markdown URLs.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks unsafe markdown image destinations before evaluation', async () => {
    renderWithMantine(`![tracker](data:image/svg+xml;base64,PHN2Zz4=)`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe markdown image URLs.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks reference-style markdown javascript links before evaluation', async () => {
    renderWithMantine(`[click me][ref]\n\n[ref]: javascript:alert(1)`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe markdown URLs.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks collapsed reference markdown javascript links before evaluation', async () => {
    renderWithMantine(`[click me][]\n\n[click me]: javascript:alert(1)`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe markdown URLs.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks shortcut reference markdown image URLs before evaluation', async () => {
    renderWithMantine(`![tracker]\n\n[tracker]: data:image/svg+xml;base64,PHN2Zz4=`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe markdown image URLs.')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('blocks unsafe URL-like props on trusted components before evaluation', async () => {
    renderWithMantine(`<Figure src="data:image/svg+xml;base64,PHN2Zz4=" />`)

    await waitFor(() => {
      expect(screen.getByText('MDX render error')).toBeInTheDocument()
    })

    expect(screen.getByText('Draft preview blocks unsafe URL-like attribute "src".')).toBeInTheDocument()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('allows trusted MDX components with simple string attributes', async () => {
    evaluateMock.mockResolvedValue({
      default: function PreviewComponent() {
        return <div>Rendered Preview</div>
      },
    })

    renderWithMantine(`<Callout title="Safe">Body</Callout>`)

    await waitFor(() => {
      expect(screen.getByText('Rendered Preview')).toBeInTheDocument()
    })

    expect(evaluateMock).toHaveBeenCalledTimes(1)
  })
})
