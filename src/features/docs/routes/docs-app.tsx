import { Center, Loader } from '@mantine/core'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useDocsStore } from '../state/docs-store'

const HomePage = lazy(async () => ({
  default: (await import('./home-page')).HomePage,
}))

const DocsReaderPage = lazy(async () => ({
  default: (await import('./reader-page')).DocsReaderPage,
}))

const AdminPage = lazy(async () => ({
  default: (await import('./admin-page')).AdminPage,
}))

const AdminLoginPage = lazy(async () => ({
  default: (await import('./admin-login-page')).AdminLoginPage,
}))

function AdminRouteGate() {
  const { adminStateStatus, authEnabled, authStatus } = useDocsStore()

  if (adminStateStatus === 'loading' && authStatus === 'checking') {
    return (
      <Center mih="100vh">
        <Loader color="dark" />
      </Center>
    )
  }

  if (authEnabled && authStatus === 'unauthenticated') {
    return <Navigate replace to="/admin/login" />
  }

  return <AdminPage />
}

function AdminLoginRouteGate() {
  const { adminStateStatus, authEnabled, authStatus } = useDocsStore()

  if (adminStateStatus === 'loading' && authStatus === 'checking') {
    return (
      <Center mih="100vh">
        <Loader color="dark" />
      </Center>
    )
  }

  if (!authEnabled || authStatus === 'authenticated') {
    return <Navigate replace to="/admin/pages" />
  }

  return <AdminLoginPage />
}

export function DocsApp() {
  return (
    <Suspense
      fallback={
        <Center mih="100vh">
          <Loader color="dark" />
        </Center>
      }
    >
      <Routes>
        <Route element={<HomePage />} path="/" />
        <Route element={<DocsReaderPage />} path="/docs/:locale/:version/*" />
        <Route element={<Navigate replace to="/admin/pages" />} path="/admin" />
        <Route element={<AdminRouteGate />} path="/admin/*" />
        <Route element={<AdminLoginRouteGate />} path="/admin/login" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  )
}
