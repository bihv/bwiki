import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Text,
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconBook2, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { defaultLocale, latestVersion, pagePath } from './helpers'

export function DocsShell({
  children,
  locale,
  localeSwitcher,
  version,
  versionSwitcher,
}: {
  children: ReactNode
  locale: string
  localeSwitcher?: ReactNode
  version: string
  versionSwitcher?: ReactNode
}) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const location = useLocation()

  return (
    <Box className="app-frame">
      <Container py={28} size="xl">
        <Group justify="space-between" mb="lg">
          <Group gap="sm">
            <Badge color="orange" radius="sm" variant="filled">
              BWiki
            </Badge>
            <Text c="dimmed" size="sm">
              {location.pathname.startsWith('/admin') ? 'Editorial control room' : `Reader · ${locale} · ${version}`}
            </Text>
          </Group>
          <Group gap="sm">
            {location.pathname.startsWith('/admin') ? null : (
              <>
                {localeSwitcher}
                {versionSwitcher}
              </>
            )}
            <Button component={Link} leftSection={<IconBook2 size={16} />} radius="xl" to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')} variant="default">
              Docs
            </Button>
            <Button component={Link} leftSection={<IconSettings size={16} />} radius="xl" to="/admin" variant={location.pathname.startsWith('/admin') ? 'filled' : 'default'}>
              Admin
            </Button>
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
        {children}
      </Container>
    </Box>
  )
}
