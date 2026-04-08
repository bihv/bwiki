import {
  AppShell,
  Badge,
  Breadcrumbs,
  Button,
  Divider,
  Grid,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconArrowRight, IconBook2, IconLanguage, IconSearch, IconSettings } from '@tabler/icons-react'
import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { PublishedDocRenderer } from '../components/published-doc-renderer'
import {
  buildPublicDocTree,
  publicDefaultLocale,
  publicDocsPages,
  publicDocsSiteConfig,
  publicLatestVersion,
  resolvePublicDocPage,
  searchPublicDocs,
} from '../content/public-docs'
import { DocsShell } from './docs-shell'
import { pagePath } from './helpers'

export function DocsReaderPage() {
  const navigate = useNavigate()
  const params = useParams()
  const slug = params['*'] || 'getting-started/introduction'
  const requestedLocale = params.locale ?? publicDefaultLocale
  const requestedVersion = params.version ?? publicLatestVersion
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const resolution = resolvePublicDocPage({
    pages: publicDocsPages,
    siteConfig: publicDocsSiteConfig,
    locale: requestedLocale,
    version: requestedVersion,
    slug,
  })

  const page = resolution.page
  const activeLocale = resolution.resolvedLocale ?? requestedLocale
  const activeVersion = resolution.resolvedVersion ?? requestedVersion
  const tree = buildPublicDocTree(publicDocsPages, activeLocale, activeVersion)
  const headings = page?.headings ?? []
  const searchResults = deferredQuery
    ? searchPublicDocs(deferredQuery, { locale: activeLocale, version: activeVersion })
    : []
  const flattenedPages = tree.flatMap((section) => section.children)
  const currentIndex = flattenedPages.findIndex((item) => item.slug === page?.slug)
  const previousPage = currentIndex > 0 ? flattenedPages[currentIndex - 1] : undefined
  const nextPage = currentIndex >= 0 ? flattenedPages[currentIndex + 1] : undefined

  useEffect(() => {
    if (!page) {
      document.title = 'BWiki · Page not found'
      return
    }

    document.title = `${page.title} · BWiki`
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', page.summary)
  }, [page])

  const handleLocaleChange = (value: string | null) => {
    if (!value || !page) {
      return
    }

    startTransition(() => {
      navigate(pagePath(value, activeVersion, page.slug))
    })
  }

  const handleVersionChange = (value: string | null) => {
    if (!value || !page) {
      return
    }

    startTransition(() => {
      navigate(pagePath(activeLocale, value, page.slug))
    })
  }

  if (!page) {
    return (
      <DocsShell locale={requestedLocale} version={requestedVersion}>
        <Stack gap="md" maw={640}>
          <Badge color="red" radius="sm" variant="light" w="fit-content">
            Missing page
          </Badge>
          <Title order={1}>This page does not exist in the current docs graph.</Title>
          <Text c="dimmed">
            Try the latest English release or pick another page from the navigation.
          </Text>
          <Button component={Link} radius="xl" to={pagePath(publicDefaultLocale, publicLatestVersion, 'getting-started/introduction')} w="fit-content">
            Go to latest introduction
          </Button>
        </Stack>
      </DocsShell>
    )
  }

  return (
    <DocsShell
      locale={activeLocale}
      localeSwitcher={
        <Select
          aria-label="Select locale"
          data={publicDocsSiteConfig.locales.map((locale) => ({ value: locale.key, label: locale.label }))}
          onChange={handleLocaleChange}
          value={activeLocale}
          w={150}
        />
      }
      version={activeVersion}
      versionSwitcher={
        <Select
          aria-label="Select version"
          data={publicDocsSiteConfig.versions.map((version) => ({
            value: version.key,
            label: `${version.label}${version.isDeprecated ? ' (deprecated)' : ''}`,
          }))}
          onChange={handleVersionChange}
          value={activeVersion}
          w={180}
        />
      }
    >
      <AppShell
        className="docs-shell"
        header={{ height: 0 }}
        navbar={{ breakpoint: 'md', width: 300 }}
        padding="lg"
        styles={{
          main: {
            background: 'transparent',
          },
        }}
      >
        <AppShell.Navbar className="docs-navbar">
          <Stack gap="md" h="100%" p="md">
            <TextInput
              leftSection={<IconSearch size={16} />}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search this release"
              radius="xl"
              value={query}
            />
            {searchResults.length > 0 ? (
              <Stack gap={4}>
                {searchResults.map((result) => (
                  <NavLink
                    active={result.slug === page.slug}
                    component={Link}
                    description={result.summary}
                    key={result.id}
                    label={result.title}
                    to={pagePath(result.locale, result.version, result.slug)}
                  />
                ))}
              </Stack>
            ) : null}
            <Divider />
            <ScrollArea scrollbarSize={6} type="auto">
              <Stack gap="xs">
                {tree.map((section) => (
                  <Stack gap={2} key={section.id}>
                    <Text className="nav-section-label">{section.title}</Text>
                    {section.children.map((item) => (
                      <NavLink
                        active={item.slug === page.slug}
                        component={Link}
                        key={item.id}
                        label={item.title}
                        to={pagePath(activeLocale, activeVersion, item.slug)}
                      />
                    ))}
                  </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Grid gap="xl">
            <Grid.Col span={{ base: 12, xl: 8 }}>
              <Stack className="docs-content" gap="lg">
              <Breadcrumbs>
                <Link className="crumb-link" to="/">
                  Home
                </Link>
                <span className="crumb-link">{page.section}</span>
                <span className="crumb-link">{page.title}</span>
              </Breadcrumbs>

              {(resolution.fallbackReason || resolution.redirectFrom) && (
                <Paper bg="rgba(227, 123, 71, 0.08)" p="md" radius="24px">
                  <Stack gap={6}>
                    <Text fw={700}>Reader fallback applied</Text>
                    <Text c="dimmed" size="sm">
                      {resolution.redirectFrom
                        ? `Redirected from ${resolution.redirectFrom}.`
                        : `Showing ${activeLocale} ${activeVersion} because the requested page was unavailable.`}
                    </Text>
                  </Stack>
                </Paper>
              )}

              <Stack gap="sm">
                <Group gap="sm">
                  <Badge color="dark" radius="sm" variant="light">
                    {activeVersion}
                  </Badge>
                  <Badge color={page.translationStatus === 'current' ? 'teal' : 'orange'} radius="sm" variant="light">
                    {page.translationStatus}
                  </Badge>
                </Group>
                <Title order={1}>{page.title}</Title>
                <Text c="dimmed" maw={720} size="lg">
                  {page.summary}
                </Text>
              </Stack>

              <div className="docs-prose">
                <PublishedDocRenderer page={page} />
              </div>

              <Divider />

              <Group grow>
                {previousPage ? (
                  <Button component={Link} justify="space-between" radius="xl" to={pagePath(activeLocale, activeVersion, previousPage.slug)} variant="default">
                    {previousPage.title}
                  </Button>
                ) : (
                  <div />
                )}
                {nextPage ? (
                  <Button component={Link} justify="space-between" radius="xl" rightSection={<IconArrowRight size={16} />} to={pagePath(activeLocale, activeVersion, nextPage.slug)}>
                    {nextPage.title}
                  </Button>
                ) : (
                  <div />
                )}
              </Group>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, xl: 4 }}>
              <Stack className="docs-aside" gap="lg">
              <Paper p="lg" radius="28px" withBorder>
                <Stack gap="sm">
                  <Text fw={700}>On this page</Text>
                  {headings.map((heading) => (
                    <a className="toc-link" href={`#${heading.id}`} key={heading.id} style={{ paddingLeft: (heading.depth - 1) * 12 }}>
                      {heading.title}
                    </a>
                  ))}
                </Stack>
              </Paper>
              <Paper p="lg" radius="28px" withBorder>
                <Stack gap="sm">
                  <Text fw={700}>Context</Text>
                  <Group gap="xs">
                    <IconLanguage size={16} />
                    <Text size="sm">Locale-aware routing with fallback</Text>
                  </Group>
                  <Group gap="xs">
                    <IconBook2 size={16} />
                    <Text size="sm">Version-aware navigation and search</Text>
                  </Group>
                  <Group gap="xs">
                    <IconSettings size={16} />
                    <Text size="sm">Open the admin workspace to edit this page</Text>
                  </Group>
                </Stack>
              </Paper>
              </Stack>
            </Grid.Col>
          </Grid>
        </AppShell.Main>
      </AppShell>
    </DocsShell>
  )
}
