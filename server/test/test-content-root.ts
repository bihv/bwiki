import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface TestContentRoot {
  rootPath: string
  contentPath: string
  cleanup: () => Promise<void>
  writeContentFile: (relativePath: string, contents: string) => Promise<void>
  readContentFile: (relativePath: string) => Promise<string>
}

const DEFAULT_SITE_CONFIG = `{
  "locales": [
    { "key": "en", "label": "English", "isDefault": true }
  ],
  "versions": [
    { "key": "v2.0", "label": "2.0", "isLatest": true, "isStable": true }
  ],
  "componentRegistry": ["Callout"],
  "redirects": []
}
`

const DEFAULT_BUILD_STATE = `{
  "status": "idle",
  "currentBuildId": null,
  "lastSuccessfulBuildId": null,
  "queuedAt": null,
  "updatedAt": null,
  "error": null
}
`

export async function createTestContentRoot(): Promise<TestContentRoot> {
  const rootPath = await mkdtemp(join(tmpdir(), 'bwiki-docs-server-'))
  const contentPath = join(rootPath, 'content')

  await mkdir(join(contentPath, 'drafts'), { recursive: true })
  await mkdir(join(contentPath, 'system'), { recursive: true })

  await writeFile(join(contentPath, 'system', 'site-config.json'), DEFAULT_SITE_CONFIG, 'utf8')
  await writeFile(join(contentPath, 'system', 'redirects.json'), '[]\n', 'utf8')
  await writeFile(join(contentPath, 'system', 'media.json'), '[]\n', 'utf8')
  await writeFile(join(contentPath, 'system', 'publish-history.json'), '[]\n', 'utf8')
  await writeFile(join(contentPath, 'system', 'build-state.json'), DEFAULT_BUILD_STATE, 'utf8')

  return {
    rootPath,
    contentPath,
    cleanup: () => rm(rootPath, { recursive: true, force: true }),
    async writeContentFile(relativePath, contents) {
      const destination = join(contentPath, relativePath)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, contents, 'utf8')
    },
    readContentFile(relativePath) {
      return readFile(join(contentPath, relativePath), 'utf8')
    },
  }
}
