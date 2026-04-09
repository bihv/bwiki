import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  Burger,
  Grid,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBook2,
  IconBrandGithub,
  IconBulb,
  IconCheck,
  IconFileDescription,
  IconHistory,
  IconMoon,
  IconPhoto,
  IconPlus,
  IconRoute,
  IconSearch,
  IconSettings,
  IconSun,
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import type { MediaAsset } from '../content/site-config'
import { MdxRenderer } from '../components/mdx-renderer'
import { validateDraft, type DraftDocInput, type DocPage, type TranslationStatus } from '../lib/docs-engine'
import { useDocsStore } from '../state/docs-store'
import { DocsShell } from './docs-shell'
import { createDraftFromPage, defaultLocale, latestVersion, pagePath, slugFromText } from './helpers'

type SelectedDocSource = 'draft' | 'published'
type AdminSection = 'dashboard' | 'pages' | 'editor' | 'redirects' | 'media' | 'audit'
type LibraryFilter = 'all' | 'draft' | 'published' | 'attention'

interface PageLibraryEntry {
  key: string
  draft?: DocPage
  published?: DocPage
  title: string
  summary: string
  locale: string
  version: string
  slug: string
  section: string
  tags: string[]
  translationStatus: TranslationStatus
  updatedAt: string
  order: number
}

function buildEditorPath(
  source: SelectedDocSource,
  page: Pick<DocPage, 'locale' | 'version' | 'slug'>,
) {
  const searchParams = new URLSearchParams({
    source,
    locale: page.locale,
    version: page.version,
    slug: page.slug,
  })

  return `/admin/editor?${searchParams.toString()}`
}

function parseEditorSelection(searchParams: URLSearchParams) {
  const source = searchParams.get('source')
  const locale = searchParams.get('locale')
  const version = searchParams.get('version')
  const slug = searchParams.get('slug')

  if ((source !== 'draft' && source !== 'published') || !locale || !version || !slug) {
    return null
  }

  return { source, locale, version, slug } as const
}

function getAdminSection(pathname: string): AdminSection {
  if (/^\/admin\/dashboard(?:\/|$)/.test(pathname)) {
    return 'dashboard'
  }

  if (/^\/admin\/pages(?:\/|$)/.test(pathname)) {
    return 'pages'
  }

  if (/^\/admin\/editor(?:\/|$)/.test(pathname)) {
    return 'editor'
  }

  if (/^\/admin\/redirects(?:\/|$)/.test(pathname)) {
    return 'redirects'
  }

  if (/^\/admin\/media(?:\/|$)/.test(pathname)) {
    return 'media'
  }

  if (/^\/admin\/audit(?:\/|$)/.test(pathname)) {
    return 'audit'
  }

  return 'pages'
}

function adminSectionPath(section: AdminSection) {
  switch (section) {
    case 'dashboard':
      return '/admin/dashboard'
    case 'pages':
      return '/admin/pages'
    case 'editor':
      return '/admin/editor'
    case 'redirects':
      return '/admin/redirects'
    case 'media':
      return '/admin/media'
    case 'audit':
      return '/admin/audit'
  }
}

const adminSections = [
  { section: 'dashboard' as const, label: 'Dashboard', icon: IconBulb },
  { section: 'pages' as const, label: 'Pages', icon: IconBook2 },
  { section: 'editor' as const, label: 'Editor', icon: IconFileDescription },
  { section: 'redirects' as const, label: 'Redirects', icon: IconRoute },
  { section: 'media' as const, label: 'Media', icon: IconPhoto },
  { section: 'audit' as const, label: 'Audit', icon: IconHistory },
]

function buildLibraryEntries(drafts: DocPage[], pages: DocPage[]): PageLibraryEntry[] {
  const entryMap = new Map<string, { draft?: DocPage; published?: DocPage }>()

  for (const page of pages) {
    const key = `${page.locale}:${page.version}:${page.slug}`
    entryMap.set(key, { ...entryMap.get(key), published: page })
  }

  for (const draft of drafts) {
    const key = `${draft.locale}:${draft.version}:${draft.slug}`
    entryMap.set(key, { ...entryMap.get(key), draft })
  }

  const entries: PageLibraryEntry[] = []

  for (const [key, value] of entryMap.entries()) {
    const preferred = value.draft ?? value.published
    if (!preferred) {
      continue
    }

    entries.push({
      key,
      draft: value.draft,
      published: value.published,
      title: preferred.title,
      summary: preferred.summary,
      locale: preferred.locale,
      version: preferred.version,
      slug: preferred.slug,
      section: preferred.section,
      tags: preferred.tags,
      translationStatus: preferred.translationStatus,
      updatedAt: value.draft?.updatedAt ?? value.published?.updatedAt ?? '',
      order: preferred.order,
    })
  }

  return entries.sort(
    (left, right) =>
      left.section.localeCompare(right.section) ||
      left.order - right.order ||
      left.title.localeCompare(right.title) ||
      left.locale.localeCompare(right.locale) ||
      left.version.localeCompare(right.version),
  )
}

function getWorkflowBadge(entry: PageLibraryEntry) {
  if (entry.draft && entry.published) {
    return { color: 'orange', label: 'Draft + published' }
  }

  if (entry.draft) {
    return { color: 'grape', label: 'Draft only' }
  }

  return { color: 'teal', label: 'Published only' }
}

function matchesLibraryFilter(entry: PageLibraryEntry, filter: LibraryFilter) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'draft') {
    return Boolean(entry.draft)
  }

  if (filter === 'published') {
    return Boolean(entry.published)
  }

  return entry.translationStatus !== 'current' || !entry.published
}

function formatTimestamp(value: string) {
  if (!value) {
    return 'Not saved yet'
  }

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? 'Unknown' : timestamp.toLocaleString()
}

function translationBadgeColor(status: TranslationStatus) {
  if (status === 'current') {
    return 'teal'
  }

  return status === 'outdated' ? 'orange' : 'red'
}

function optionLabel(options: Array<{ key: string; label: string }>, key: string) {
  return options.find((option) => option.key === key)?.label ?? key
}

export function AdminPage() {
  const {
    authEnabled,
    drafts,
    logout,
    localeOptions,
    media,
    pages,
    publishRecords,
    publishStatus,
    redirects,
    role,
    saveDraft,
    publish,
    setRole,
    siteConfig,
    versionOptions,
  } = useDocsStore()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<DraftDocInput>(() => createDraftFromPage())
  const [redirectForm, setRedirectForm] = useState({ from: '', to: '', locale: defaultLocale, version: latestVersion })
  const [mediaForm, setMediaForm] = useState<MediaAsset>({
    id: '',
    title: '',
    url: '',
    kind: 'image',
  })
  const [pagesQuery, setPagesQuery] = useState('')
  const [pagesLocaleFilter, setPagesLocaleFilter] = useState('all')
  const [pagesVersionFilter, setPagesVersionFilter] = useState('all')
  const [pagesStatusFilter, setPagesStatusFilter] = useState<LibraryFilter>('all')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [navOpened, { close: closeNav, toggle: toggleNav }] = useDisclosure(false)
  const redirectWriteMessage = 'Read-only: redirect writes are not supported by the current docs API yet.'
  const mediaWriteMessage = 'Read-only: media writes are not supported by the current docs API yet.'

  const currentSection = getAdminSection(location.pathname)
  const currentSectionItem = adminSections.find((item) => item.section === currentSection) ?? adminSections[1]
  const editorSelection = useMemo(
    () => parseEditorSelection(new URLSearchParams(location.search)),
    [location.search],
  )
  const editorSelectionKey = editorSelection
    ? `${editorSelection.source}:${editorSelection.locale}:${editorSelection.version}:${editorSelection.slug}`
    : 'new'
  const combinedRedirects = [...siteConfig.redirects, ...redirects]
  const validation = validateDraft(draft, pages, { ...siteConfig, redirects: combinedRedirects })
  const missingTranslations = pages.filter((page) => page.translationStatus !== 'current').length
  const currentPublishStatus = publishStatus?.status ?? 'unknown'
  const libraryEntries = buildLibraryEntries(drafts, pages)
  const query = pagesQuery.trim().toLowerCase()
  const filteredEntries = libraryEntries.filter((entry) => {
    const matchesQuery =
      query.length === 0 ||
      [
        entry.title,
        entry.summary,
        entry.section,
        entry.slug,
        entry.locale,
        entry.version,
        entry.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)

    return (
      matchesQuery &&
      (pagesLocaleFilter === 'all' || entry.locale === pagesLocaleFilter) &&
      (pagesVersionFilter === 'all' || entry.version === pagesVersionFilter) &&
      matchesLibraryFilter(entry, pagesStatusFilter)
    )
  })
  const currentTranslations = libraryEntries.filter((entry) => entry.translationStatus === 'current').length
  const draftBacklog = libraryEntries.filter((entry) => Boolean(entry.draft)).length
  const selectedLocaleLabel = optionLabel(localeOptions, draft.locale)
  const selectedVersionLabel = optionLabel(versionOptions, draft.version)

  useEffect(() => {
    if (!editorSelection) {
      setDraft(createDraftFromPage())
      return
    }

    const selectedDraft = drafts.find(
      (item) =>
        item.locale === editorSelection.locale &&
        item.version === editorSelection.version &&
        item.slug === editorSelection.slug,
    )
    const selectedPage = pages.find(
      (item) =>
        item.locale === editorSelection.locale &&
        item.version === editorSelection.version &&
        item.slug === editorSelection.slug,
    )
    const selectedDoc =
      editorSelection.source === 'draft'
        ? selectedDraft ?? selectedPage
        : selectedPage ?? selectedDraft

    setDraft(createDraftFromPage(selectedDoc))
  }, [drafts, editorSelection, editorSelectionKey, pages])

  useEffect(() => {
    closeNav()
  }, [closeNav, location.pathname])

  const handleDraftField = (field: keyof DraftDocInput) => (value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: field === 'tags' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
    }))
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logout()
    setIsLoggingOut(false)
  }

  const handleSaveDraft = async () => {
    setSaveError(null)
    setSaveMessage(null)
    setPublishError(null)
    setPublishMessage(null)
    setIsSaving(true)

    const result = await saveDraft(draft)
    setIsSaving(false)

    if (result.errors.length > 0) {
      setSaveError(result.errors.join(', '))
      return
    }

    if (result.draft) {
      navigate(buildEditorPath('draft', result.draft), { replace: true })
    }

    setSaveMessage('Draft saved to the API.')
  }

  const handlePublish = async () => {
    setPublishError(null)
    setPublishMessage(null)
    setSaveError(null)
    setSaveMessage(null)
    setIsPublishing(true)

    const saveResult = await saveDraft(draft)
    if (saveResult.errors.length > 0) {
      setIsPublishing(false)
      setPublishError(saveResult.errors.join(', '))
      return
    }

    if (saveResult.draft) {
      navigate(buildEditorPath('draft', saveResult.draft), { replace: true })
    }

    const publishResult = await publish(draft, {
      expectedUpdatedAt: saveResult.draft?.updatedAt,
    })
    setIsPublishing(false)

    if (publishResult.errors.length > 0) {
      setPublishError(publishResult.errors.join(', '))
      return
    }

    setPublishMessage('Publish queued through the API.')
  }

  const dashboardPanel = (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
        <Metric title="Published pages" value={String(pages.length)} />
        <Metric title="Draft backlog" value={String(draftBacklog)} />
        <Metric title="Translations current" value={`${currentTranslations}/${libraryEntries.length || 0}`} />
        <Metric title="Audit entries" value={String(publishRecords.length)} />
      </SimpleGrid>

      <Paper p="xl" radius="32px" withBorder>
        <Grid align="stretch" gap="xl">
          <Grid.Col span={{ base: 12, xl: 7 }}>
            <Stack gap="lg">
              <div>
                <Text c="dimmed" fw={700} size="sm" tt="uppercase">
                  Editorial overview
                </Text>
                <Title mt={6} order={2}>
                  Keep content operations separate from page authoring
                </Title>
                <Text c="dimmed" maw={640} mt="sm">
                  The workspace now splits page management from writing so operators can scan the content library, open the right page, then focus entirely on editing.
                </Text>
              </div>

              <Group gap="sm" wrap="wrap">
                <Button component={Link} radius="xl" to="/admin/pages">
                  Open pages library
                </Button>
                <Button component={Link} radius="xl" to="/admin/editor" variant="default">
                  Start a new page
                </Button>
                <Button
                  component={Link}
                  leftSection={<IconBrandGithub size={16} />}
                  radius="xl"
                  to={pagePath(defaultLocale, latestVersion, 'guides/editorial-flow')}
                  variant="default"
                >
                  Review editorial docs
                </Button>
              </Group>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Paper p="lg" radius="24px" withBorder>
                  <Stack gap="xs">
                    <Text fw={700}>What changed</Text>
                    <Text c="dimmed" size="sm">
                      `Pages` is now the management surface for discovery and switching.
                    </Text>
                    <Text c="dimmed" size="sm">
                      `Editor` now dedicates the main canvas to title, summary, and MDX body.
                    </Text>
                    <Text c="dimmed" size="sm">
                      `Preview` now lives beside the raw MDX editor, while `Validation` stays in the inspector.
                    </Text>
                  </Stack>
                </Paper>
                <Paper p="lg" radius="24px" withBorder>
                  <Stack gap="xs">
                    <Text fw={700}>Content health</Text>
                    {pages.slice(0, 6).map((page) => (
                      <Group justify="space-between" key={page.id}>
                        <Text size="sm">{page.title}</Text>
                        <Badge color={translationBadgeColor(page.translationStatus)} radius="sm" variant="light">
                          {page.translationStatus}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              </SimpleGrid>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, xl: 5 }}>
            <Paper h="100%" p="lg" radius="24px" withBorder>
              <Stack gap="md" h="100%" justify="space-between">
                <div>
                  <Text fw={700}>Operator shortcuts</Text>
                  <Text c="dimmed" mt="xs" size="sm">
                    Start in the pages library when you need to search, filter, or switch locales. Open editor only when you are ready to work on one page.
                  </Text>
                </div>
                <Stack gap="sm">
                  <Badge color={currentPublishStatus === 'queued' ? 'orange' : 'blue'} radius="sm" variant="light" w="fit-content">
                    Publish status: {currentPublishStatus}
                  </Badge>
                  <Badge color={missingTranslations > 0 ? 'orange' : 'teal'} radius="sm" variant="light" w="fit-content">
                    Missing or stale translations: {missingTranslations}
                  </Badge>
                  <Text c="dimmed" size="sm">
                    Save drafts before publish so validation, preview, and publish history stay distinct.
                  </Text>
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Paper>
    </Stack>
  )

  const pagesPanel = (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
        <Metric title="Library entries" value={String(libraryEntries.length)} />
        <Metric title="Drafts in progress" value={String(draftBacklog)} />
        <Metric title="Published only" value={String(libraryEntries.filter((entry) => entry.published && !entry.draft).length)} />
        <Metric title="Needs attention" value={String(libraryEntries.filter((entry) => matchesLibraryFilter(entry, 'attention')).length)} />
      </SimpleGrid>

      <Paper p="xl" radius="32px" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" wrap="wrap">
            <div>
              <Title order={2}>Pages</Title>
              <Text c="dimmed" mt={4}>
                Search across the library, then open a single page in the editor when you are ready to write.
              </Text>
            </div>
            <Button component={Link} leftSection={<IconPlus size={16} />} radius="xl" to="/admin/editor">
              New page
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
            <TextInput
              label="Search"
              leftSection={<IconSearch size={16} />}
              onChange={(event) => setPagesQuery(event.currentTarget.value)}
              placeholder="Title, slug, section..."
              value={pagesQuery}
            />
            <Select
              data={[
                { value: 'all', label: 'All locales' },
                ...localeOptions.map((locale) => ({ value: locale.key, label: locale.label })),
              ]}
              label="Locale"
              onChange={(value) => setPagesLocaleFilter(value ?? 'all')}
              value={pagesLocaleFilter}
            />
            <Select
              data={[
                { value: 'all', label: 'All versions' },
                ...versionOptions.map((version) => ({ value: version.key, label: version.label })),
              ]}
              label="Version"
              onChange={(value) => setPagesVersionFilter(value ?? 'all')}
              value={pagesVersionFilter}
            />
            <Select
              data={[
                { value: 'all', label: 'All workflow states' },
                { value: 'draft', label: 'Has draft' },
                { value: 'published', label: 'Published' },
                { value: 'attention', label: 'Needs attention' },
              ]}
              label="Workflow"
              onChange={(value) => setPagesStatusFilter((value as LibraryFilter | null) ?? 'all')}
              value={pagesStatusFilter}
            />
          </SimpleGrid>

          <Group justify="space-between" wrap="wrap">
            <Text c="dimmed" size="sm">
              Showing {filteredEntries.length} of {libraryEntries.length} entries
            </Text>
            <Group gap="xs">
              <Badge color="grape" radius="sm" variant="light">
                Drafts: {draftBacklog}
              </Badge>
              <Badge color="teal" radius="sm" variant="light">
                Current translations: {currentTranslations}
              </Badge>
            </Group>
          </Group>

          {filteredEntries.length === 0 ? (
            <Paper p="xl" radius="24px" withBorder>
              <Stack align="center" gap="xs" py="xl">
                <Text fw={700}>No pages match the current filters</Text>
                <Text c="dimmed" size="sm">
                  Broaden the search or create a new page from here.
                </Text>
              </Stack>
            </Paper>
          ) : (
            <ScrollArea scrollbarSize={6}>
              <Table highlightOnHover verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Page</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Workflow</Table.Th>
                    <Table.Th>Translation</Table.Th>
                    <Table.Th>Updated</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredEntries.map((entry) => {
                    const workflowBadge = getWorkflowBadge(entry)
                    const preferredSource: SelectedDocSource = entry.draft ? 'draft' : 'published'
                    const preferredPage = entry.draft ?? entry.published

                    if (!preferredPage) {
                      return null
                    }

                    return (
                      <Table.Tr key={entry.key}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={700}>{entry.title || 'Untitled page'}</Text>
                            <Text c="dimmed" size="sm">
                              {entry.summary || 'No summary yet.'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">
                              {entry.section} · {optionLabel(localeOptions, entry.locale)} · {optionLabel(versionOptions, entry.version)}
                            </Text>
                            <Text c="dimmed" size="sm">
                              /{entry.slug}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={6}>
                            <Badge color={workflowBadge.color} radius="sm" variant="light" w="fit-content">
                              {workflowBadge.label}
                            </Badge>
                            {entry.draft && entry.published ? (
                              <Text c="dimmed" size="xs">
                                Draft changes are staged over the published page.
                              </Text>
                            ) : null}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={translationBadgeColor(entry.translationStatus)} radius="sm" variant="light">
                            {entry.translationStatus}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text c="dimmed" size="sm">
                            {formatTimestamp(entry.updatedAt)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" justify="flex-end" wrap="nowrap">
                            <Button component={Link} radius="xl" size="compact-md" to={buildEditorPath(preferredSource, preferredPage)} variant={entry.draft ? 'filled' : 'default'}>
                              Open editor
                            </Button>
                            {entry.published ? (
                              <Button
                                component={Link}
                                radius="xl"
                                size="compact-md"
                                to={pagePath(entry.published.locale, entry.published.version, entry.published.slug)}
                                variant="subtle"
                              >
                                Open docs
                              </Button>
                            ) : null}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Paper>
    </Stack>
  )

  const editorPanel = (
    <Stack gap="lg">
      <Paper p="xl" radius="32px" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap="xs">
              <div>
                <Title order={2}>{draft.title.trim() || 'Untitled page'}</Title>
                <Text c="dimmed" mt={4}>
                  {selectedLocaleLabel} · {selectedVersionLabel} · {draft.slug ? `/${draft.slug}` : 'Set the slug in Settings'}
                </Text>
              </div>
            </Stack>

            <Group gap="sm">
              <Button loading={isSaving} onClick={() => void handleSaveDraft()} radius="xl" variant="default">
                Save draft
              </Button>
              <Button
                disabled={!validation.valid || isPublishing}
                loading={isPublishing}
                onClick={() => void handlePublish()}
                radius="xl"
              >
                Publish
              </Button>
            </Group>
          </Group>

          {saveMessage ? (
            <Text c="teal" size="sm">
              {saveMessage}
            </Text>
          ) : null}
          {saveError ? (
            <Text c="red" size="sm">
              {saveError}
            </Text>
          ) : null}
          {publishMessage ? (
            <Text c="teal" size="sm">
              {publishMessage}
            </Text>
          ) : null}
          {publishError ? (
            <Text c="red" size="sm">
              {publishError}
            </Text>
          ) : null}
        </Stack>
      </Paper>

      <Grid align="start" gap="lg">
        <Grid.Col span={{ base: 12, xl: 8 }}>
          <Stack gap="lg">
            <Paper p="xl" radius="32px" withBorder>
              <Stack gap="md">
                <div>
                  <Text fw={700}>Core content</Text>
                  <Text c="dimmed" size="sm">
                    Keep the main canvas focused on the page itself. Use the inspector tabs for metadata, validation, and preview.
                  </Text>
                </div>
                <TextInput
                  label="Title"
                  onChange={(event) => handleDraftField('title')(event.currentTarget.value)}
                  value={draft.title}
                />
                <Textarea
                  autosize
                  label="Summary"
                  minRows={3}
                  onChange={(event) => handleDraftField('summary')(event.currentTarget.value)}
                  value={draft.summary}
                />
              </Stack>
            </Paper>

            <Paper p="xl" radius="32px" withBorder>
              <Stack gap="md">
                <div>
                  <Text fw={700}>MDX body</Text>
                  <Text c="dimmed" size="sm">
                    Edit the raw MDX, then switch to Preview when you want to check the rendered page.
                  </Text>
                </div>

                <Tabs defaultValue="raw" keepMounted={false}>
                  <Tabs.List>
                    <Tabs.Tab value="raw">Raw</Tabs.Tab>
                    <Tabs.Tab value="preview">Preview</Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel pt="md" value="raw">
                    <Textarea
                      autosize
                      label={null}
                      minRows={24}
                      onChange={(event) => handleDraftField('body')(event.currentTarget.value)}
                      styles={{
                        input: {
                          fontFamily: 'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          minHeight: 560,
                        },
                      }}
                      value={draft.body}
                    />
                  </Tabs.Panel>

                  <Tabs.Panel pt="md" value="preview">
                    <ScrollArea h={560} scrollbarSize={6}>
                      <Stack gap="md" pr="sm">
                        <div>
                          <Title order={1}>{draft.title.trim() || 'Untitled page'}</Title>
                          {draft.summary.trim() ? (
                            <Text c="dimmed" mt="sm">
                              {draft.summary}
                            </Text>
                          ) : null}
                        </div>
                        <div className="docs-prose">
                          <MdxRenderer source={draft.body} />
                        </div>
                      </Stack>
                    </ScrollArea>
                  </Tabs.Panel>
                </Tabs>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, xl: 4 }}>
          <Paper p="lg" radius="32px" style={{ position: 'sticky', top: '1.5rem' }} withBorder>
            <Tabs defaultValue="settings" keepMounted={false}>
              <Tabs.List grow>
                <Tabs.Tab leftSection={<IconSettings size={16} />} value="settings">
                  Settings
                </Tabs.Tab>
                <Tabs.Tab leftSection={<IconCheck size={16} />} value="validation">
                  Validation
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel pt="md" value="settings">
                <Stack gap="md">
                  <TextInput
                    label="Slug"
                    onChange={(event) => handleDraftField('slug')(event.currentTarget.value)}
                    value={draft.slug}
                  />
                  <TextInput
                    label="Section"
                    onChange={(event) => handleDraftField('section')(event.currentTarget.value)}
                    value={draft.section}
                  />
                  <Select
                    data={localeOptions.map((locale) => ({ value: locale.key, label: locale.label }))}
                    label="Locale"
                    onChange={(value) => value && handleDraftField('locale')(value)}
                    value={draft.locale}
                  />
                  <Select
                    data={versionOptions.map((version) => ({ value: version.key, label: version.label }))}
                    label="Version"
                    onChange={(value) => value && handleDraftField('version')(value)}
                    value={draft.version}
                  />
                  <TextInput
                    label="Translation key"
                    onChange={(event) => handleDraftField('translationKey')(event.currentTarget.value)}
                    value={draft.translationKey}
                  />
                  <Select
                    data={[
                      { value: 'current', label: 'Current' },
                      { value: 'outdated', label: 'Outdated' },
                      { value: 'missing', label: 'Missing' },
                    ]}
                    label="Translation status"
                    onChange={(value) => value && handleDraftField('translationStatus')(value)}
                    value={draft.translationStatus}
                  />
                  <TextInput
                    label="Tags"
                    onChange={(event) => handleDraftField('tags')(event.currentTarget.value)}
                    placeholder="cli, release, onboarding"
                    value={draft.tags.join(', ')}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel pt="md" value="validation">
                <Stack gap="md">
                  {validation.errors.length === 0 ? (
                    <>
                      <Badge color="teal" radius="sm" variant="light" w="fit-content">
                        Ready to publish
                      </Badge>
                      <Text c="dimmed" size="sm">
                        All required fields, slug rules, and translation metadata are passing the current publish checks.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Badge color="orange" radius="sm" variant="light" w="fit-content">
                        {validation.errors.length} issue{validation.errors.length === 1 ? '' : 's'} to fix
                      </Badge>
                      {validation.errors.map((error) => (
                        <Text c="red" key={error} size="sm">
                          {error}
                        </Text>
                      ))}
                    </>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  )

  const redirectsPanel = (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 5 }}>
        <Paper p="xl" radius="28px" withBorder>
          <Stack gap="md">
            <Title order={3}>Add redirect</Title>
            <Text c="dimmed" size="sm">
              {redirectWriteMessage}
            </Text>
            <TextInput
              disabled
              label="From slug"
              onChange={(event) => setRedirectForm((current) => ({ ...current, from: event.currentTarget.value }))}
              value={redirectForm.from}
            />
            <TextInput
              disabled
              label="To slug"
              onChange={(event) => setRedirectForm((current) => ({ ...current, to: event.currentTarget.value }))}
              value={redirectForm.to}
            />
            <Select
              disabled
              data={localeOptions.map((locale) => ({ value: locale.key, label: locale.label }))}
              label="Locale"
              onChange={(value) => value && setRedirectForm((current) => ({ ...current, locale: value }))}
              value={redirectForm.locale}
            />
            <Select
              disabled
              data={versionOptions.map((version) => ({ value: version.key, label: version.label }))}
              label="Version"
              onChange={(value) => value && setRedirectForm((current) => ({ ...current, version: value }))}
              value={redirectForm.version}
            />
            <Button disabled radius="xl">
              Redirect writes unavailable
            </Button>
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 7 }}>
        <Paper p="xl" radius="28px" withBorder>
          <Stack gap="md">
            <Title order={3}>Redirect table</Title>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>From</Table.Th>
                  <Table.Th>To</Table.Th>
                  <Table.Th>Locale</Table.Th>
                  <Table.Th>Version</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {combinedRedirects.map((rule) => (
                  <Table.Tr key={`${rule.from}:${rule.locale ?? 'all'}:${rule.version ?? 'all'}`}>
                    <Table.Td>{rule.from}</Table.Td>
                    <Table.Td>{rule.to}</Table.Td>
                    <Table.Td>{rule.locale ?? 'all'}</Table.Td>
                    <Table.Td>{rule.version ?? 'all'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  )

  const mediaPanel = (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 5 }}>
        <Paper p="xl" radius="28px" withBorder>
          <Stack gap="md">
            <Title order={3}>Register media asset</Title>
            <Text c="dimmed" size="sm">
              {mediaWriteMessage}
            </Text>
            <TextInput
              disabled
              label="Title"
              onChange={(event) =>
                setMediaForm((current) => ({
                  ...current,
                  title: event.currentTarget.value,
                  id: slugFromText(event.currentTarget.value),
                }))
              }
              value={mediaForm.title}
            />
            <TextInput
              disabled
              label="URL"
              onChange={(event) => setMediaForm((current) => ({ ...current, url: event.currentTarget.value }))}
              value={mediaForm.url}
            />
            <Select
              disabled
              data={[
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
                { value: 'file', label: 'File' },
              ]}
              label="Kind"
              onChange={(value) => value && setMediaForm((current) => ({ ...current, kind: value as MediaAsset['kind'] }))}
              value={mediaForm.kind}
            />
            <Button disabled radius="xl">
              Media writes unavailable
            </Button>
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 7 }}>
        <Paper p="xl" radius="28px" withBorder>
          <Stack gap="md">
            <Title order={3}>Media library</Title>
            {media.map((asset) => (
              <Group justify="space-between" key={asset.id}>
                <div>
                  <Text fw={600}>{asset.title}</Text>
                  <Text c="dimmed" size="sm">
                    {asset.url}
                  </Text>
                </div>
                <Badge radius="sm" variant="light">
                  {asset.kind}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  )

  const auditPanel = (
    <Paper p="xl" radius="28px" withBorder>
      <Stack gap="md">
        <Title order={3}>Publish history</Title>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Actor</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Timestamp</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {publishRecords.map((record) => (
              <Table.Tr key={`${record.actorId}:${record.timestamp}:${record.targetSlug}`}>
                <Table.Td>{record.actor}</Table.Td>
                <Table.Td>{record.role}</Table.Td>
                <Table.Td>{record.targetSlug}</Table.Td>
                <Table.Td>
                  {record.locale} · {record.version}
                </Table.Td>
                <Table.Td>{new Date(record.timestamp).toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  )

  return (
    <DocsShell hideTopBar>
      <AppShell
        className="docs-shell"
        header={{ height: { base: 124, md: 68 } }}
        navbar={{
          width: 220,
          breakpoint: 'md',
          collapsed: { mobile: !navOpened },
        }}
        padding="lg"
        styles={{
          main: {
            background: 'transparent',
          },
        }}
      >
        <AppShell.Header>
          <Group h="100%" justify="space-between" px="md" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger hiddenFrom="md" onClick={toggleNav} opened={navOpened} size="sm" />
              <Group gap="xs" wrap="wrap">
                <Title order={3}>Editorial workspace</Title>
                <Badge radius="sm" variant="light">
                  {currentSectionItem.label}
                </Badge>
              </Group>
            </Group>

            <Group gap="sm" justify="flex-end" wrap="wrap">
              <Button component={Link} leftSection={<IconBook2 size={16} />} radius="xl" to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')} variant="default">
                Docs
              </Button>
              {authEnabled ? (
                <Button loading={isLoggingOut} onClick={() => void handleLogout()} radius="xl" variant="default">
                  Sign out
                </Button>
              ) : (
                <SegmentedControl
                  data={[
                    { label: 'Admin', value: 'admin' },
                    { label: 'Editor', value: 'editor' },
                  ]}
                  onChange={(value) => setRole(value as 'admin' | 'editor')}
                  radius="xl"
                  value={role}
                  />
                )}
              <ActionIcon
                aria-label="Toggle color scheme"
                onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
                radius="xl"
                size="lg"
                variant="default"
              >
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar className="docs-navbar" p="md">
          <Stack gap="xs">
            {adminSections.map(({ section, label, icon: Icon }) => (
              <NavLink
                active={currentSection === section}
                component={Link}
                key={section}
                label={label}
                leftSection={<Icon size={16} />}
                onClick={closeNav}
                to={adminSectionPath(section)}
              />
            ))}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg">
            <Group gap="sm" wrap="wrap">
              <Badge color={currentPublishStatus === 'queued' ? 'orange' : 'blue'} radius="sm" variant="light">
                Publish status: {currentPublishStatus}
              </Badge>
              <Badge color={missingTranslations > 0 ? 'orange' : 'teal'} radius="sm" variant="light">
                Translation attention: {missingTranslations}
              </Badge>
            </Group>

            {currentSection === 'dashboard' ? dashboardPanel : null}
            {currentSection === 'pages' ? pagesPanel : null}
            {currentSection === 'editor' ? editorPanel : null}
            {currentSection === 'redirects' ? redirectsPanel : null}
            {currentSection === 'media' ? mediaPanel : null}
            {currentSection === 'audit' ? auditPanel : null}
          </Stack>
        </AppShell.Main>
      </AppShell>
    </DocsShell>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Paper p="lg" radius="28px" withBorder>
      <Stack gap="xs">
        <Text c="dimmed" size="sm">
          {title}
        </Text>
        <Title order={2}>{value}</Title>
      </Stack>
    </Paper>
  )
}
