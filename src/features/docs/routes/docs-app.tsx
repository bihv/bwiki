import { Center, Loader } from '@mantine/core'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const HomePage = lazy(async () => ({
  default: (await import('./home-page')).HomePage,
}))

const DocsReaderPage = lazy(async () => ({
  default: (await import('./reader-page')).DocsReaderPage,
}))

const AdminPage = lazy(async () => ({
  default: (await import('./admin-page')).AdminPage,
}))

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
        <Route element={<AdminPage />} path="/admin" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  )
}
