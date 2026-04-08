import {
  ActionIcon,
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

  return (
    <Box className="app-frame">
      <Container pb={28} pt={hideTopBar ? 12 : 28} size="xl">
        {hideTopBar ? null : (
          <Group justify="flex-end" mb="lg">
            <Group gap="sm">
              {isAdminRoute ? null : (
                <>
                  {localeSwitcher}
                  {versionSwitcher}
                </>
              )}
              <Button component={Link} leftSection={<IconBook2 size={16} />} radius="xl" to={pagePath(defaultLocale, latestVersion, 'getting-started/introduction')} variant="default">
                Docs
              </Button>
              <Button component={Link} leftSection={<IconSettings size={16} />} radius="xl" to="/admin/pages" variant={isAdminRoute ? 'filled' : 'default'}>
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
        )}
        {children}
      </Container>
    </Box>
  )
}
