import type { DraftDocInput, PublishRecord, SiteConfig } from '../lib/docs-engine'
import { generatedDocsSiteConfig } from '../generated/docs-manifest.generated'

export const DOCS_STORAGE_KEYS = {
  drafts: 'bwiki.docs.drafts',
  published: 'bwiki.docs.published',
  publishRecords: 'bwiki.docs.publish-records',
  redirects: 'bwiki.docs.redirects',
  media: 'bwiki.docs.media',
  role: 'bwiki.docs.role',
} as const

export const docsSiteConfig: SiteConfig = generatedDocsSiteConfig

export type DocsRole = 'admin' | 'editor'

export interface MediaAsset {
  id: string
  title: string
  url: string
  kind: 'image' | 'video' | 'file'
}

export interface DocsStorageShape {
  drafts: DraftDocInput[]
  published: DraftDocInput[]
  publishRecords: PublishRecord[]
  redirects: SiteConfig['redirects']
  media: MediaAsset[]
  role: DocsRole
}

export const defaultDocsStorage: DocsStorageShape = {
  drafts: [],
  published: [],
  publishRecords: [],
  redirects: [],
  media: [
    {
      id: 'asset-editorial-surface',
      title: 'Editorial Surface',
      url: '/editorial-surface.svg',
      kind: 'image',
    },
  ],
  role: 'admin',
}
