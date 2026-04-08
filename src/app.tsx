import { BrowserRouter } from 'react-router-dom'

import { DocsApp } from './features/docs/routes/docs-app'
import { DocsProvider } from './features/docs/state/docs-store'

export function App() {
  return (
    <BrowserRouter>
      <DocsProvider>
        <DocsApp />
      </DocsProvider>
    </BrowserRouter>
  )
}
