import { createDocsApp } from './app'
import { loadServerConfig } from './config'

const config = loadServerConfig()
const app = createDocsApp({ contentRootPath: config.contentRootPath })

app.listen(config.port, () => {
  console.log(`Docs server listening on http://localhost:${config.port}`)
})
