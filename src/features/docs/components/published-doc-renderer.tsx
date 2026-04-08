import { Loader, Stack, Text } from '@mantine/core'
import { lazy, Suspense, createElement, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'

import { generatedPageModules } from '../generated/docs-page-modules.generated'
import type { PublicDocPage } from '../content/public-docs'
import {
  Callout,
  Card,
  CardGrid,
  CodeBlock,
  DocAccordion,
  DocAccordionItem,
  DocTab,
  DocTabs,
  ExternalEmbed,
  Figure,
  InlineCode,
  MarkdownLink,
} from './mdx-blocks'

type PublishedMdxComponent = ComponentType<Record<string, unknown>>

const componentCache = new Map<string, LazyExoticComponent<PublishedMdxComponent>>()

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=,[\]{}|\\:;"'<>,.?/]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map((child) => textFromChildren(child)).join(' ')
  }

  if (children && typeof children === 'object' && 'props' in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children ?? '')
  }

  return ''
}

function createHeading(level: 'h1' | 'h2' | 'h3' | 'h4') {
  return function Heading({ children }: { children: ReactNode }) {
    const text = textFromChildren(children)
    return createElement(level, { id: slugify(text) }, children)
  }
}

const mdxComponents = {
  a: MarkdownLink,
  pre: CodeBlock,
  code: InlineCode,
  h1: createHeading('h1'),
  h2: createHeading('h2'),
  h3: createHeading('h3'),
  h4: createHeading('h4'),
  Callout,
  Card,
  CardGrid,
  DocAccordion,
  DocAccordionItem,
  DocTab,
  DocTabs,
  ExternalEmbed,
  Figure,
}

function getPublishedComponent(page: Pick<PublicDocPage, 'id'>): LazyExoticComponent<PublishedMdxComponent> | undefined {
  const cachedComponent = componentCache.get(page.id)
  if (cachedComponent) {
    return cachedComponent
  }

  const loadModule = generatedPageModules[page.id]
  if (!loadModule) {
    return undefined
  }

  const Component = lazy(async () => {
    const module = await loadModule()
    return { default: module.default as PublishedMdxComponent }
  })
  componentCache.set(page.id, Component)
  return Component
}

export function PublishedDocRenderer({ page }: { page: Pick<PublicDocPage, 'id'> }) {
  const Content = getPublishedComponent(page)

  if (!Content) {
    return (
      <Stack bg="rgba(185, 74, 41, 0.08)" gap="xs" p="lg" style={{ borderRadius: 20 }}>
        <Text fw={700}>Published MDX module missing</Text>
        <Text c="dimmed" size="sm">
          No generated module was registered for {page.id}.
        </Text>
      </Stack>
    )
  }

  return (
    <Suspense
      fallback={
        <Stack align="center" gap="xs" py="xl">
          <Loader color="dark" size="sm" />
          <Text c="dimmed" size="sm">
            Loading published page...
          </Text>
        </Stack>
      }
    >
      <Content components={mdxComponents} />
    </Suspense>
  )
}
