import {
  Badge,
  Button,
  Grid,
  Group,
  Loader,
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
} from '@mantine/core'
import {
  IconBook2,
  IconBrandGithub,
  IconBulb,
  IconHistory,
  IconRefresh,
  IconPhoto,
  IconPlus,
  IconRoute,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { MediaAsset } from '../content/site-config'
import { MdxRenderer } from '../components/mdx-renderer'
import { useDocsStore } from '../state/docs-store'
import { validateDraft, type DraftDocInput } from '../lib/docs-engine'
import { DocsShell } from './docs-shell'
import { createDraftFromPage, defaultLocale, latestVersion, pagePath, slugFromText } from './helpers'

export function AdminPage() {
  const {
    adminStateError,
    adminStateStatus,
    drafts,
    localeOptions,
    media,
    pages,
    publishRecords,
    publishStatus,
    redirects,
    refreshAdminState,
    role,
    saveDraft,
    publish,
    setRole,
    siteConfig,
    versionOptions,
  } = useDocsStore()
  const [selectedKey, setSelectedKey] = useState<string>('new')
  const [draft, setDraft] = useState<DraftDocInput>(() => createDraftFromPage())
  const [redirectForm, setRedirectForm] = useState({ from: '', to: '', locale: defaultLocale, version: latestVersion })
  const [mediaForm, setMediaForm] = useState<MediaAsset>({
    id: '',
    title: '',
    url: '',
    kind: 'image',
  })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const redirectWriteMessage = 'Read-only: redirect writes are not supported by the current docs API yet.'
  const mediaWriteMessage = 'Read-only: media writes are not supported by the current docs API yet.'

  useEffect(() => {
    if (selectedKey === 'new') {
      setDraft(createDraftFromPage())
      return
    }

    const [locale, version, ...slugParts] = selectedKey.split(':')
    const slug = slugParts.join(':')
    const selectedDraft = drafts.find((item) => item.locale === locale && item.version === version && item.slug === slug)
    const selectedPage = pages.find((item) => item.locale === locale && item.version === version && item.slug === slug)
    setDraft(createDraftFromPage(selectedDraft ?? selectedPage))
  }, [selectedKey])

  const combinedRedirects = [...siteConfig.redirects, ...redirects]
  const validation = validateDraft(draft, pages, { ...siteConfig, redirects: combinedRedirects })
  const missingTranslations = pages.filter((page) => page.translationStatus !== 'current').length
  const isAdminStateLoading = adminStateStatus === 'loading'
  const currentPublishStatus = publishStatus?.status ?? (isAdminStateLoading ? 'loading' : 'unknown')
  const handleDraftField = (field: keyof DraftDocInput) => (value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: field === 'tags' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
    }))
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
      setSelectedKey(`${result.draft.locale}:${result.draft.version}:${result.draft.slug}`)
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
      setSelectedKey(`${saveResult.draft.locale}:${saveResult.draft.version}:${saveResult.draft.slug}`)
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

  return (
    <DocsShell locale={defaultLocale} version={latestVersion}>
      <Tabs defaultValue="dashboard" variant="none">
        <Tabs.List mb="lg">
          <Tabs.Tab leftSection={<IconBulb size={16} />} value="dashboard">
            Dashboard
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconBook2 size={16} />} value="editor">
            Editor
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconRoute size={16} />} value="redirects">
            Redirects
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconPhoto size={16} />} value="media">
            Media
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconHistory size={16} />} value="audit">
            Audit
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="dashboard">
          <SimpleGrid cols={{ base: 1, md: 4 }} spacing="lg">
            <Metric title="Published pages" value={String(pages.length)} />
            <Metric title="Draft queue" value={String(drafts.length)} />
            <Metric title="Missing or stale translations" value={String(missingTranslations)} />
            <Metric title="Audit entries" value={String(publishRecords.length)} />
          </SimpleGrid>

          <Paper mt="lg" p="xl" radius="32px" withBorder>
            <Stack gap="lg">
              <Group justify="space-between">
                <div>
                  <Title order={2}>Editorial control room</Title>
                  <Text c="dimmed">Switch roles, scan content health, then move into editor, redirect, or media workflows.</Text>
                </div>
                <Group gap="sm">
                  <Button
                    leftSection={isAdminStateLoading ? <Loader size={14} /> : <IconRefresh size={16} />}
                    loading={isAdminStateLoading}
                    onClick={() => void refreshAdminState()}
                    radius="xl"
                    variant="default"
                  >
                    Refresh API state
                  </Button>
                  <SegmentedControl
                    data={[
                      { label: 'Admin', value: 'admin' },
                      { label: 'Editor', value: 'editor' },
                    ]}
                    onChange={(value) => setRole(value as 'admin' | 'editor')}
                    radius="xl"
                    value={role}
                  />
                </Group>
              </Group>
              <Group gap="sm">
                <Badge color={adminStateStatus === 'error' ? 'red' : adminStateStatus === 'ready' ? 'teal' : 'gray'} radius="sm" variant="light">
                  Admin state: {adminStateStatus}
                </Badge>
                <Badge color={currentPublishStatus === 'queued' ? 'orange' : 'blue'} radius="sm" variant="light">
                  Publish status: {currentPublishStatus}
                </Badge>
              </Group>
              {adminStateError ? (
                <Text c="red" size="sm">
                  {adminStateError}
                </Text>
              ) : null}
              <Grid gap="xl">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="xs">
                    <Text fw={700}>Content health</Text>
                    {pages.map((page) => (
                      <Group justify="space-between" key={page.id}>
                        <Text size="sm">{page.title}</Text>
                        <Badge color={page.translationStatus === 'current' ? 'teal' : 'orange'} radius="sm" variant="light">
                          {page.translationStatus}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="xs">
                    <Text fw={700}>Operator shortcuts</Text>
                    <Text c="dimmed" size="sm">
                      Save drafts before publish so validation, preview, and history stay distinct.
                    </Text>
                    <Text c="dimmed" size="sm">
                      Drafts, publish status, redirects, media, and history now hydrate from the docs API instead of browser storage.
                    </Text>
                    <Button component={Link} leftSection={<IconBrandGithub size={16} />} radius="xl" to={pagePath(defaultLocale, latestVersion, 'guides/editorial-flow')} variant="default">
                      Review editorial docs
                    </Button>
                  </Stack>
                </Grid.Col>
              </Grid>
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="editor">
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, xl: 4 }}>
              <Paper p="lg" radius="28px" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text fw={700}>Pages</Text>
                    <Button leftSection={<IconPlus size={16} />} onClick={() => setSelectedKey('new')} radius="xl" size="compact-md" variant="light">
                      New
                    </Button>
                  </Group>
                  <ScrollArea h={520} scrollbarSize={6}>
                    <Stack gap={6}>
                      {drafts.length > 0 ? (
                        <>
                          <Text c="dimmed" size="xs" tt="uppercase">
                            Drafts
                          </Text>
                          {drafts.map((draftPage) => (
                            <NavLink
                              active={selectedKey === `${draftPage.locale}:${draftPage.version}:${draftPage.slug}`}
                              description={`${draftPage.locale} / ${draftPage.version}`}
                              key={`draft:${draftPage.id}`}
                              label={`${draftPage.title} (draft)`}
                              onClick={() => setSelectedKey(`${draftPage.locale}:${draftPage.version}:${draftPage.slug}`)}
                            />
                          ))}
                          <Text c="dimmed" mt="sm" size="xs" tt="uppercase">
                            Published
                          </Text>
                        </>
                      ) : null}
                      {pages.map((page) => (
                        <NavLink
                          active={selectedKey === `${page.locale}:${page.version}:${page.slug}`}
                          description={`${page.locale} · ${page.version}`}
                          key={page.id}
                          label={page.title}
                          onClick={() => setSelectedKey(`${page.locale}:${page.version}:${page.slug}`)}
                        />
                      ))}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, xl: 8 }}>
              <Stack gap="lg">
                <Paper p="xl" radius="28px" withBorder>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <TextInput label="Title" onChange={(event) => handleDraftField('title')(event.currentTarget.value)} value={draft.title} />
                    <TextInput label="Summary" onChange={(event) => handleDraftField('summary')(event.currentTarget.value)} value={draft.summary} />
                    <TextInput label="Slug" onChange={(event) => handleDraftField('slug')(event.currentTarget.value)} value={draft.slug} />
                    <TextInput label="Section" onChange={(event) => handleDraftField('section')(event.currentTarget.value)} value={draft.section} />
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
                  </SimpleGrid>

                  <TextInput
                    label="Tags"
                    mt="md"
                    onChange={(event) => handleDraftField('tags')(event.currentTarget.value)}
                    value={draft.tags.join(', ')}
                  />

                  <Textarea
                    autosize
                    label="MDX body"
                    minRows={14}
                    mt="md"
                    onChange={(event) => handleDraftField('body')(event.currentTarget.value)}
                    value={draft.body}
                  />

                  <Group mt="md">
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
                  {saveMessage ? (
                    <Text c="teal" mt="sm" size="sm">
                      {saveMessage}
                    </Text>
                  ) : null}
                  {saveError ? (
                    <Text c="red" mt="sm" size="sm">
                      {saveError}
                    </Text>
                  ) : null}
                  {publishMessage ? (
                    <Text c="teal" mt="xs" size="sm">
                      {publishMessage}
                    </Text>
                  ) : null}
                  {publishError ? (
                    <Text c="red" mt="xs" size="sm">
                      {publishError}
                    </Text>
                  ) : null}
                </Paper>

                <Grid gap="lg">
                  <Grid.Col span={{ base: 12, xl: 4 }}>
                    <Paper p="lg" radius="28px" withBorder>
                      <Stack gap="sm">
                        <Text fw={700}>Validation</Text>
                        {validation.errors.length === 0 ? (
                          <Badge color="teal" radius="sm" variant="light" w="fit-content">
                            Ready to publish
                          </Badge>
                        ) : (
                          validation.errors.map((error) => (
                            <Text c="red" key={error} size="sm">
                              {error}
                            </Text>
                          ))
                        )}
                      </Stack>
                    </Paper>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, xl: 8 }}>
                    <Paper p="lg" radius="28px" withBorder>
                      <Stack gap="sm">
                        <Text fw={700}>Preview</Text>
                        <div className="docs-prose">
                          <MdxRenderer source={draft.body} />
                        </div>
                      </Stack>
                    </Paper>
                  </Grid.Col>
                </Grid>
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="redirects">
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
        </Tabs.Panel>

        <Tabs.Panel value="media">
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
                      setMediaForm((current) => ({ ...current, title: event.currentTarget.value, id: slugFromText(event.currentTarget.value) }))
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
        </Tabs.Panel>

        <Tabs.Panel value="audit">
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
        </Tabs.Panel>
      </Tabs>
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
