import { Loader, Stack, Text } from '@mantine/core'
import { evaluate } from '@mdx-js/mdx'
import { createElement, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import * as runtime from 'react/jsx-runtime'

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

const moduleCache = new Map<string, ComponentType>()
const allowedPreviewComponents = new Set([
  'Callout',
  'Card',
  'CardGrid',
  'DocAccordion',
  'DocAccordionItem',
  'DocTab',
  'DocTabs',
  'ExternalEmbed',
  'Figure',
])
const urlLikeAttributes = new Set(['href', 'src', 'url', 'poster'])

function stripCodeFences(source: string) {
  return source.replace(/```[\s\S]*?```/g, '')
}

function normalizeMarkdownDestination(destination: string) {
  const trimmed = destination.trim()
  const withoutTitle = trimmed.replace(/\s+["'][^"']*["']\s*$/, '')
  const unwrapped = withoutTitle.replace(/^<|>$/g, '')
  return unwrapped.trim()
}

function isSafeMarkdownLink(destination: string) {
  const normalized = normalizeMarkdownDestination(destination)

  if (!normalized) {
    return false
  }

  if (/^(?:javascript|data|vbscript|file):/i.test(normalized)) {
    return false
  }

  return /^(?:https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(normalized)
}

function isSafeMarkdownImage(destination: string) {
  const normalized = normalizeMarkdownDestination(destination)

  if (!normalized) {
    return false
  }

  if (/^(?:javascript|data|vbscript|file):/i.test(normalized)) {
    return false
  }

  return /^(?:https?:|\/|\.\/|\.\.\/)/i.test(normalized)
}

function normalizeReferenceLabel(label: string) {
  return label.trim().toLowerCase()
}

function getReferenceDestinations(source: string) {
  const destinations = new Map<string, string>()

  for (const match of source.matchAll(/^\s*\[([^\]]+)\]:\s*(.+)$/gm)) {
    const label = normalizeReferenceLabel(match[1] ?? '')
    const destination = match[2] ?? ''

    if (label) {
      destinations.set(label, destination)
    }
  }

  return destinations
}

function getResolvedReferenceDestination(
  destinations: Map<string, string>,
  explicitLabel: string | undefined,
  fallbackLabel: string,
) {
  const label = normalizeReferenceLabel(explicitLabel && explicitLabel.length > 0 ? explicitLabel : fallbackLabel)
  return destinations.get(label)
}

function getUnsafePreviewReason(source: string): string | null {
  const sanitizedSource = stripCodeFences(source)

  if (/^\s*(import|export)\s/m.test(sanitizedSource)) {
    return 'Draft preview blocks MDX import/export statements.'
  }

  if (sanitizedSource.includes('{') || sanitizedSource.includes('}')) {
    return 'Draft preview blocks MDX JavaScript expressions. Remove expression braces to preview this draft safely.'
  }

  if (/<!--|<!DOCTYPE|<\?xml/i.test(sanitizedSource)) {
    return 'Draft preview blocks raw HTML markup.'
  }

  for (const match of sanitizedSource.matchAll(/(?<!!)\[[^\]]*]\(([^)]+)\)/g)) {
    const destination = match[1] ?? ''
    if (!isSafeMarkdownLink(destination)) {
      return 'Draft preview blocks unsafe markdown URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
    const destination = match[1] ?? ''
    if (!isSafeMarkdownImage(destination)) {
      return 'Draft preview blocks unsafe markdown image URLs.'
    }
  }

  const referenceDestinations = getReferenceDestinations(sanitizedSource)

  for (const match of sanitizedSource.matchAll(/!\[[^\]]*]\[([^\]]+)\]/g)) {
    const label = normalizeReferenceLabel(match[1] ?? '')
    const destination = referenceDestinations.get(label)

    if (destination && !isSafeMarkdownImage(destination)) {
      return 'Draft preview blocks unsafe markdown image URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/(?<!!)\[[^\]]+\]\[([^\]]+)\]/g)) {
    const label = normalizeReferenceLabel(match[1] ?? '')
    const destination = referenceDestinations.get(label)

    if (destination && !isSafeMarkdownLink(destination)) {
      return 'Draft preview blocks unsafe markdown URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/!\[([^\]]*)]\[(.*?)\]/g)) {
    const fallbackLabel = match[1] ?? ''
    const explicitLabel = match[2] ?? ''
    const destination = getResolvedReferenceDestination(referenceDestinations, explicitLabel, fallbackLabel)

    if (destination && !isSafeMarkdownImage(destination)) {
      return 'Draft preview blocks unsafe markdown image URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/(?<!!)\[([^\]]+)]\[(.*?)\]/g)) {
    const fallbackLabel = match[1] ?? ''
    const explicitLabel = match[2] ?? ''
    const destination = getResolvedReferenceDestination(referenceDestinations, explicitLabel, fallbackLabel)

    if (destination && !isSafeMarkdownLink(destination)) {
      return 'Draft preview blocks unsafe markdown URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/!\[([^\]]+)](?![\[(])/g)) {
    const fallbackLabel = match[1] ?? ''
    const destination = getResolvedReferenceDestination(referenceDestinations, undefined, fallbackLabel)

    if (destination && !isSafeMarkdownImage(destination)) {
      return 'Draft preview blocks unsafe markdown image URLs.'
    }
  }

  for (const match of sanitizedSource.matchAll(/(?<!!)\[([^\]]+)](?![\[(])/g)) {
    const fallbackLabel = match[1] ?? ''
    const destination = getResolvedReferenceDestination(referenceDestinations, undefined, fallbackLabel)

    if (destination && !isSafeMarkdownLink(destination)) {
      return 'Draft preview blocks unsafe markdown URLs.'
    }
  }

  const tagMatcher = /<\s*\/?\s*([A-Za-z][A-Za-z0-9-]*)\b([^<>]*)>/g

  for (const match of sanitizedSource.matchAll(tagMatcher)) {
    const tagName = match[1] ?? ''
    const rawAttributes = (match[2] ?? '').replace(/\/\s*$/, '').trim()

    if (tagName[0] === tagName[0]?.toLowerCase()) {
      return 'Draft preview blocks raw HTML/JSX tags.'
    }

    if (!allowedPreviewComponents.has(tagName)) {
      return `Draft preview only allows trusted MDX components. Remove unsupported component <${tagName}>.`
    }

    let remainingAttributes = rawAttributes
    while (remainingAttributes.length > 0) {
      const attributeMatch = /^([A-Za-z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'))?\s*/.exec(remainingAttributes)
      if (!attributeMatch) {
        return 'Draft preview blocks non-literal MDX component attributes.'
      }

      const attributeName = attributeMatch[1] ?? ''
      const attributeValue = attributeMatch[3] ?? attributeMatch[4] ?? ''

      if (attributeName === 'dangerouslySetInnerHTML' || /^on[A-Za-z]+$/.test(attributeName)) {
        return `Draft preview blocks unsafe attribute "${attributeName}".`
      }

      if (urlLikeAttributes.has(attributeName)) {
        const isSafeUrl =
          attributeName === 'href' ? isSafeMarkdownLink(attributeValue) : isSafeMarkdownImage(attributeValue)

        if (!isSafeUrl) {
          return `Draft preview blocks unsafe URL-like attribute "${attributeName}".`
        }
      } else if (/^\s*javascript:/i.test(attributeValue)) {
        return 'Draft preview blocks javascript: URLs.'
      }

      remainingAttributes = remainingAttributes.slice(attributeMatch[0].length).trimStart()
    }
  }

  return null
}

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

export function MdxRenderer({ source }: { source: string }) {
  const [Content, setContent] = useState<ComponentType | null>(() => moduleCache.get(source) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const unsafeReason = getUnsafePreviewReason(source)

    if (unsafeReason) {
      setContent(null)
      setError(unsafeReason)
      return () => {
        active = false
      }
    }

    if (moduleCache.has(source)) {
      setContent(() => moduleCache.get(source) ?? null)
      setError(null)
      return () => {
        active = false
      }
    }

    void evaluate(source, {
      ...runtime,
      useMDXComponents: () => mdxComponents,
    })
      .then((module) => {
        if (!active) {
          return
        }

        moduleCache.set(source, module.default)
        setContent(() => module.default)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!active) {
          return
        }

        setError(reason instanceof Error ? reason.message : 'Failed to render MDX content')
      })

    return () => {
      active = false
    }
  }, [source])

  if (error) {
    return (
      <Stack bg="rgba(185, 74, 41, 0.08)" gap="xs" p="lg" style={{ borderRadius: 20 }}>
        <Text fw={700}>MDX render error</Text>
        <Text c="dimmed" size="sm">
          {error}
        </Text>
      </Stack>
    )
  }

  if (!Content) {
    return (
      <Stack align="center" gap="xs" py="xl">
        <Loader color="dark" size="sm" />
        <Text c="dimmed" size="sm">
          Rendering preview...
        </Text>
      </Stack>
    )
  }

  return <Content />
}
