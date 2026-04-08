import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'

import { loadSeedDocs } from '../content/doc-loader'
import { DOCS_STORAGE_KEYS, defaultDocsStorage, docsSiteConfig, type DocsRole, type MediaAsset } from '../content/site-config'
import { buildDocSearch, validateDraft, type DraftDocInput, type DocPage, type PublishRecord, type RedirectRule, type SiteConfig } from '../lib/docs-engine'
import {
  getPublishStatus as fetchPublishStatus,
  loadDocsAdminState,
  publishDraft as queuePublishDraft,
  saveDraft as persistDraft,
  type PublishStatus,
} from './docs-api'

type AdminStateStatus = 'loading' | 'ready' | 'error'

interface DocsContextValue {
  adminStateError: string | null
  adminStateStatus: AdminStateStatus
  drafts: DocPage[]
  localeOptions: SiteConfig['locales']
  media: MediaAsset[]
  pages: DocPage[]
  publishRecords: PublishRecord[]
  publishStatus: PublishStatus | null
  redirects: RedirectRule[]
  role: DocsRole
  siteConfig: SiteConfig
  versionOptions: SiteConfig['versions']
  saveDraft: (draft: DraftDocInput) => Promise<{ draft?: DocPage; errors: string[] }>
  publish: (draft: DraftDocInput, options?: { expectedUpdatedAt?: string }) => Promise<{ errors: string[] }>
  refreshAdminState: () => Promise<void>
  setRole: (role: DocsRole) => void
  addRedirect: (rule: RedirectRule) => { errors: string[] }
  addMedia: (asset: MediaAsset) => { errors: string[] }
  searchDocs: (query: string, options: { locale: string; version: string; limit?: number }) => DocPage[]
  getDraft: (locale: string, version: string, slug: string) => DraftDocInput | undefined
}

const DocsContext = createContext<DocsContextValue | null>(null)
const seedPages = loadSeedDocs()

function readRoleStorage(): DocsRole {
  if (typeof window === 'undefined') {
    return defaultDocsStorage.role
  }

  const value = window.localStorage.getItem(DOCS_STORAGE_KEYS.role)
  if (!value) {
    return defaultDocsStorage.role
  }

  try {
    return JSON.parse(value) as DocsRole
  } catch {
    return defaultDocsStorage.role
  }
}

function docKey(doc: Pick<DraftDocInput, 'locale' | 'version' | 'slug'>): string {
  return `${doc.locale}:${doc.version}:${doc.slug}`
}

function createActor(role: DocsRole) {
  return role === 'admin'
    ? { id: 'admin-operator', name: 'Admin Operator', role }
    : { id: 'editor-operator', name: 'Editor Operator', role }
}

function toDraftInput(page: Pick<DocPage, 'title' | 'summary' | 'locale' | 'version' | 'slug' | 'section' | 'tags' | 'body' | 'translationKey' | 'translationStatus'>): DraftDocInput {
  return {
    title: page.title,
    summary: page.summary,
    locale: page.locale,
    version: page.version,
    slug: page.slug,
    section: page.section,
    tags: page.tags,
    body: page.body,
    translationKey: page.translationKey,
    translationStatus: page.translationStatus,
  }
}

function withDocFirst<T extends Pick<DraftDocInput, 'locale' | 'version' | 'slug'>>(items: T[], item: T): T[] {
  return [item, ...items.filter((current) => docKey(current) !== docKey(item))]
}

export function DocsProvider({ children }: PropsWithChildren) {
  const location = useLocation()
  const adminSessionIdRef = useRef(0)
  const adminRequestIdRef = useRef(0)
  const [drafts, setDrafts] = useState<DocPage[]>([])
  const [pages, setPages] = useState<DocPage[]>(seedPages)
  const [publishRecords, setPublishRecords] = useState<PublishRecord[]>([])
  const [redirects, setRedirects] = useState<RedirectRule[]>([])
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(docsSiteConfig)
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(null)
  const [adminStateStatus, setAdminStateStatus] = useState<AdminStateStatus>('loading')
  const [adminStateError, setAdminStateError] = useState<string | null>(null)
  const [role, setRole] = useState<DocsRole>(readRoleStorage)

  const search = buildDocSearch(pages)
  const isAdminRoute = /^\/admin(?:\/|$)/.test(location.pathname)

  async function refreshAdminState() {
    if (!isAdminRoute) {
      return
    }

    const requestId = ++adminRequestIdRef.current
    setAdminStateStatus('loading')
    setAdminStateError(null)

    try {
      const adminState = await loadDocsAdminState()

      if (adminRequestIdRef.current !== requestId) {
        return
      }

      setDrafts(adminState.drafts)
      setPages(adminState.pages)
      setRedirects(adminState.redirects)
      setMedia(adminState.media)
      setPublishRecords(adminState.publishRecords)
      setSiteConfig(adminState.siteConfig)
      setPublishStatus(adminState.publishStatus)
      setAdminStateStatus('ready')
    } catch (error) {
      if (adminRequestIdRef.current !== requestId) {
        return
      }

      setAdminStateStatus('error')
      setAdminStateError(error instanceof Error ? error.message : 'Failed to load docs admin state')
    }
  }

  useEffect(() => {
    if (!isAdminRoute) {
      adminSessionIdRef.current += 1
      adminRequestIdRef.current += 1
      setAdminStateStatus('ready')
      setAdminStateError(null)
      setDrafts([])
      setPages(seedPages)
      setRedirects([])
      setMedia([])
      setPublishRecords([])
      setSiteConfig(docsSiteConfig)
      setPublishStatus(null)
      return
    }

    void refreshAdminState()
  }, [isAdminRoute, location.pathname])

  useEffect(() => {
    window.localStorage.setItem(DOCS_STORAGE_KEYS.role, JSON.stringify(role))
  }, [role])

  const activeSiteConfig = isAdminRoute ? siteConfig : docsSiteConfig

  const value: DocsContextValue = {
    adminStateError,
    adminStateStatus,
    drafts,
    localeOptions: activeSiteConfig.locales,
    media,
    pages,
    publishRecords,
    publishStatus,
    redirects,
    role,
    siteConfig: activeSiteConfig,
    versionOptions: activeSiteConfig.versions,
    async saveDraft(draft) {
      const sessionId = adminSessionIdRef.current

      try {
        const existingDraft = drafts.find((item) => docKey(item) === docKey(draft))
        const existingPage = pages.find((item) => docKey(item) === docKey(draft))
        const savedDraft = await persistDraft({
          draft,
          order: existingDraft?.order ?? existingPage?.order ?? 999,
          expectedUpdatedAt: existingDraft?.updatedAt || undefined,
        })

        if (adminSessionIdRef.current !== sessionId) {
          return { draft: savedDraft, errors: [] }
        }

        setDrafts((currentDrafts) => withDocFirst(currentDrafts, savedDraft))
        return { draft: savedDraft, errors: [] }
      } catch (error) {
        return {
          errors: [error instanceof Error ? error.message : 'Failed to save draft'],
        }
      }
    },
    async publish(draft, options) {
      const sessionId = adminSessionIdRef.current
      const validation = validateDraft(draft, pages, {
        ...activeSiteConfig,
        redirects: [...activeSiteConfig.redirects, ...redirects],
      })

      if (!validation.valid) {
        return { errors: validation.errors }
      }

      try {
        const queuedStatus = await queuePublishDraft({
          draft,
          actor: createActor(role),
          expectedUpdatedAt:
            options?.expectedUpdatedAt ??
            drafts.find((item) => docKey(item) === docKey(draft))?.updatedAt ??
            undefined,
        })

        if (adminSessionIdRef.current !== sessionId) {
          return { errors: [] }
        }

        setPublishStatus((currentStatus) =>
          currentStatus
            ? { ...currentStatus, status: queuedStatus.status }
            : {
                status: queuedStatus.status,
                currentBuildId: null,
                lastSuccessfulBuildId: null,
                queuedAt: null,
                updatedAt: null,
                error: null,
              },
        )

        try {
          const nextPublishStatus = await fetchPublishStatus()
          if (adminSessionIdRef.current !== sessionId) {
            return { errors: [] }
          }
          setPublishStatus(nextPublishStatus)
        } catch {
          // Keep the accepted queued state if the follow-up refresh flakes.
        }

        return { errors: [] }
      } catch (error) {
        return {
          errors: [error instanceof Error ? error.message : 'Failed to queue publish'],
        }
      }
    },
    refreshAdminState,
    setRole,
    addRedirect(_rule) {
      return {
        errors: ['Redirect writes are not supported by the current docs API yet.'],
      }
    },
    addMedia(_asset) {
      return {
        errors: ['Media writes are not supported by the current docs API yet.'],
      }
    },
    searchDocs(query, options) {
      return search.search(query, options)
    },
    getDraft(locale, version, slug) {
      const draft = drafts.find((item) => item.locale === locale && item.version === version && item.slug === slug)
      return draft ? toDraftInput(draft) : undefined
    },
  }

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>
}

export function useDocsStore() {
  const context = useContext(DocsContext)
  if (!context) {
    throw new Error('useDocsStore must be used inside DocsProvider')
  }

  return context
}
