import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Container,
  Group,
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconBook2, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { defaultLocale, latestVersion, pagePath } from './helpers'

export const PUBLIC_HEADER_HEIGHT = { base: 124, md: 68 } as const

export function DocsShell({
  children,
  hideTopBar = false,
  localeSwitcher,
  versionSwitcher,
}: {
  children: ReactNode
  hideTopBar?: boolean
  localeSwitcher?: ReactNode
  versionSwitcher?: ReactNode
}) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  const docsButton = (
    <Button
      component={Link}
      leftSection={<IconBook2 size={16} />}
      radius="xl"
      to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')}
      variant="default"
    >
      Docs
    </Button>
  )

  const adminButton = (
    <Button component={Link} leftSection={<IconSettings size={16} />} radius="xl" to="/admin/pages" variant={isAdminRoute ? 'filled' : 'default'}>
      Admin
    </Button>
  )

  const colorSchemeToggle = (
    <ActionIcon
      aria-label="Toggle color scheme"
      onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
      radius="xl"
      size="lg"
      variant="default"
    >
      {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  )

  return (
    <Box className="app-frame">
      {hideTopBar ? (
        <Container pb={28} pt={12} size="xl">
          {children}
        </Container>
      ) : (
        <AppShell
          className="docs-shell-frame"
          header={{ height: PUBLIC_HEADER_HEIGHT }}
          padding={0}
          styles={{
            main: {
              background: 'transparent',
            },
          }}
        >
          <AppShell.Header className="docs-shell-header">
            <Container className="docs-shell-header-inner" h="100%" size="xl">
              <Box className="docs-shell-header-layout">
                {isAdminRoute ? null : (
                  <Box className="docs-shell-switchers">
                    {localeSwitcher}
                    {versionSwitcher}
                  </Box>
                )}

                <Group className="docs-shell-mobile-actions" gap="sm" wrap="nowrap">
                  <Box className="docs-shell-mobile-action">{docsButton}</Box>
                  <Box className="docs-shell-mobile-action">{adminButton}</Box>
                  {colorSchemeToggle}
                </Group>
              </Box>
            </Container>
          </AppShell.Header>

          <AppShell.Main>
            <Container pb={28} pt={12} size="xl">
              {children}
            </Container>
          </AppShell.Main>
        </AppShell>
      )}
    </Box>
  )
}
