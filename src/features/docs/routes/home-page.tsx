import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Container,
} from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { Link } from 'react-router-dom'

import { useDocsStore } from '../state/docs-store'
import { defaultLocale, latestVersion, pagePath } from './helpers'

export function HomePage() {
  const { pages, localeOptions, versionOptions } = useDocsStore()
  const featuredPages = pages.filter((page) => page.version === latestVersion && page.locale === defaultLocale).slice(0, 3)

  return (
    <Box className="landing-shell">
      <Container py={36} size="xl">
        <Group justify="space-between">
          <Group gap="sm">
            <Badge color="orange" radius="sm" variant="filled">
              BWiki
            </Badge>
            <Text c="dimmed" size="sm">
              Public docs system with MDX embeds, versioning, and editorial controls
            </Text>
          </Group>
          <Group gap="sm">
            <Button component={Link} radius="xl" to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')} variant="default">
              Open docs
            </Button>
            <Button component={Link} radius="xl" to="/admin">
              Open admin
            </Button>
          </Group>
        </Group>

        <Paper className="landing-hero" mt={40} p={{ base: 28, md: 56 }} radius="32px">
          <Stack gap="xl">
            <Badge color="orange" radius="sm" variant="light" w="fit-content">
              React + Mantine + MDX runtime
            </Badge>
            <Title className="landing-title" order={1}>
              Build a docs system that reads like an editorial product and operates like a lightweight control room.
            </Title>
            <Text className="landing-summary" maw={760} size="lg">
              This starter includes locale-aware routes, version switching, full-text search, whitelisted dynamic blocks inside markdown, and an admin workspace for draft, preview, publish, redirects, and audit history.
            </Text>
            <Group gap="md">
              <Button component={Link} radius="xl" rightSection={<IconArrowRight size={16} />} size="md" to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')}>
                Start reading
              </Button>
              <Button component={Link} radius="xl" size="md" to="/admin" variant="default">
                Review editorial flow
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
              <Stack gap="xs">
                <Text fw={700}>Locales</Text>
                <Text c="dimmed">{localeOptions.map((locale) => locale.label).join(' · ')}</Text>
              </Stack>
              <Stack gap="xs">
                <Text fw={700}>Versions</Text>
                <Text c="dimmed">{versionOptions.map((version) => `${version.label}${version.isDeprecated ? ' deprecated' : ''}`).join(' · ')}</Text>
              </Stack>
              <Stack gap="xs">
                <Text fw={700}>Dynamic blocks</Text>
                <Text c="dimmed">Callouts, tabs, accordion, cards, code copy, figure, safe embeds</Text>
              </Stack>
            </SimpleGrid>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 3 }} mt={40} spacing="lg">
          {featuredPages.map((page) => (
            <Paper key={page.id} p="xl" radius="28px" withBorder>
              <Stack gap="md">
                <Badge color="dark" radius="sm" variant="light" w="fit-content">
                  {page.section}
                </Badge>
                <Title order={3}>{page.title}</Title>
                <Text c="dimmed">{page.summary}</Text>
                <Button component={Link} justify="space-between" radius="xl" rightSection={<IconArrowRight size={16} />} to={pagePath(page.locale, page.version, page.slug)} variant="subtle">
                  Open page
                </Button>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  )
}
