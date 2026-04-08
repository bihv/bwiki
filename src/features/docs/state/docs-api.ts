import type { MediaAsset } from '../content/site-config'
import type { DraftDocInput, DocPage, PublishActor, PublishRecord, RedirectRule, SiteConfig } from '../lib/docs-engine'

export class UnauthorizedApiError extends Error {
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthorizedApiError'
  }
}

export interface PublishStatus {
  status: string
  currentBuildId: string | null
  lastSuccessfulBuildId: string | null
  queuedAt: string | null
  updatedAt: string | null
  error: string | null
}

export interface DocsAdminState {
  drafts: DocPage[]
  pages: DocPage[]
  redirects: RedirectRule[]
  media: MediaAsset[]
  publishRecords: PublishRecord[]
  siteConfig: SiteConfig
  publishStatus: PublishStatus
}

export interface DocsAdminSession {
  authEnabled: boolean
  authenticated: boolean
  username: string | null
}

interface ApiErrorShape {
  error?: string
  issues?: string[]
}

function encodeSlug(slug: string) {
  return slug
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildDraftPath(input: Pick<DraftDocInput, 'locale' | 'version' | 'slug'>) {
  return `/api/docs/drafts/${encodeURIComponent(input.locale)}/${encodeURIComponent(input.version)}/${encodeSlug(input.slug)}`
}

function buildPublishPath(input: Pick<DraftDocInput, 'locale' | 'version' | 'slug'>) {
  return `/api/docs/publish/${encodeURIComponent(input.locale)}/${encodeURIComponent(input.version)}/${encodeSlug(input.slug)}`
}

function parseApiErrorMessage(payload: unknown, status: number) {
  if (!payload || typeof payload !== 'object') {
    return `Request failed with status ${status}`
  }

  const maybeError = payload as ApiErrorShape
  const issues = Array.isArray(maybeError.issues) ? maybeError.issues.filter((issue) => typeof issue === 'string') : []

  if (typeof maybeError.error === 'string' && issues.length > 0) {
    return `${maybeError.error}: ${issues.join(', ')}`
  }

  if (typeof maybeError.error === 'string') {
    return maybeError.error
  }

  return `Request failed with status ${status}`
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    if (response.status === 401) {
      throw new UnauthorizedApiError(parseApiErrorMessage(payload, response.status))
    }

    throw new Error(parseApiErrorMessage(payload, response.status))
  }

  return payload as T
}

export async function loadDocsAdminSession() {
  return requestJson<DocsAdminSession>('/api/docs/auth/session')
}

export async function loginDocsAdmin(input: { password: string; username: string }) {
  return requestJson<DocsAdminSession>('/api/docs/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function logoutDocsAdmin() {
  return requestJson<DocsAdminSession>('/api/docs/auth/logout', {
    method: 'POST',
  })
}

export async function loadDocsAdminState(): Promise<DocsAdminState> {
  const [draftsResponse, pagesResponse, redirectsResponse, mediaResponse, publishHistoryResponse, siteConfigResponse, publishStatus] =
    await Promise.all([
      requestJson<{ drafts: DocPage[] }>('/api/docs/drafts'),
      requestJson<{ pages: DocPage[] }>('/api/docs/pages'),
      requestJson<{ redirects: RedirectRule[] }>('/api/docs/system/redirects'),
      requestJson<{ media: MediaAsset[] }>('/api/docs/system/media'),
      requestJson<{ publishHistory: PublishRecord[] }>('/api/docs/system/publish-history'),
      requestJson<{ siteConfig: SiteConfig }>('/api/docs/system/site-config'),
      requestJson<PublishStatus>('/api/docs/publish-status'),
    ])

  return {
    drafts: draftsResponse.drafts,
    pages: pagesResponse.pages,
    redirects: redirectsResponse.redirects,
    media: mediaResponse.media,
    publishRecords: publishHistoryResponse.publishHistory,
    siteConfig: siteConfigResponse.siteConfig,
    publishStatus,
  }
}

export async function saveDraft(input: {
  draft: DraftDocInput
  expectedUpdatedAt?: string
  order?: number
}): Promise<DocPage> {
  const response = await requestJson<{ draft: DocPage }>(buildDraftPath(input.draft), {
    method: 'PUT',
    body: JSON.stringify({
      title: input.draft.title,
      summary: input.draft.summary,
      section: input.draft.section,
      order: input.order ?? 999,
      tags: input.draft.tags,
      body: input.draft.body,
      translationKey: input.draft.translationKey,
      translationStatus: input.draft.translationStatus,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),
  })

  return response.draft
}

export async function publishDraft(input: {
  draft: Pick<DraftDocInput, 'locale' | 'version' | 'slug'>
  actor: PublishActor
  expectedUpdatedAt?: string
}): Promise<{ status: 'queued' }> {
  return requestJson<{ status: 'queued' }>(buildPublishPath(input.draft), {
    method: 'POST',
    body: JSON.stringify({
      actor: input.actor,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),
  })
}

export async function getPublishStatus() {
  return requestJson<PublishStatus>('/api/docs/publish-status')
}
