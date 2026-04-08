import { Button, Center, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useState, type FormEvent } from 'react'

import { useDocsStore } from '../state/docs-store'
import { DocsShell } from './docs-shell'

export function AdminLoginPage() {
  const { adminStateError, authStatus, login } = useDocsStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError(null)
    setIsLoggingIn(true)

    const result = await login({
      username,
      password,
    })

    setIsLoggingIn(false)

    if (result.errors.length > 0) {
      setLoginError(result.errors.join(', '))
      return
    }

    setPassword('')
  }

  return (
    <DocsShell>
      <Center mih="70vh">
        <Paper maw={520} p="xl" radius="32px" w="100%" withBorder>
          <Stack gap="lg">
            <div>
              <Title order={2}>Admin sign in</Title>
              <Text c="dimmed" mt="xs">
                Sign in with the admin credentials from the server `.env` file to unlock editorial actions.
              </Text>
            </div>
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  autoComplete="username"
                  label="Username"
                  onChange={(event) => setUsername(event.currentTarget.value)}
                  placeholder="admin"
                  required
                  value={username}
                />
                <PasswordInput
                  autoComplete="current-password"
                  label="Password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  value={password}
                />
                {loginError ? (
                  <Text c="red" size="sm">
                    {loginError}
                  </Text>
                ) : null}
                {adminStateError ? (
                  <Text c="red" size="sm">
                    {adminStateError}
                  </Text>
                ) : null}
                <Button loading={isLoggingIn} radius="xl" type="submit">
                  Sign in
                </Button>
                {authStatus === 'checking' ? (
                  <Center>
                    <Loader size="sm" />
                  </Center>
                ) : null}
              </Stack>
            </form>
          </Stack>
        </Paper>
      </Center>
    </DocsShell>
  )
}
