import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'

const ADMIN_SESSION_COOKIE = 'bwiki_docs_admin_session'
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12

export interface DocsAdminAuthOptions {
  password?: string | null
  sessionTtlSeconds?: number
  username?: string | null
}

export interface DocsAdminSessionState {
  authEnabled: boolean
  authenticated: boolean
  username: string | null
}

interface SessionPayload {
  expiresAt: number
  username: string
}

function createCredentialHash(value: string) {
  return createHash('sha256').update(value).digest()
}

function credentialMatches(actual: string, expected: string) {
  return timingSafeEqual(createCredentialHash(actual), createCredentialHash(expected))
}

function parseCookieHeader(headerValue: string | undefined) {
  if (!headerValue) {
    return new Map<string, string>()
  }

  return new Map(
    headerValue
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=')
        if (separatorIndex === -1) {
          return [entry, ''] as const
        }

        return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)] as const
      }),
  )
}

function parseSessionPayload(value: string | null, secret: Buffer): SessionPayload | null {
  if (!value) {
    return null
  }

  const separatorIndex = value.lastIndexOf('.')
  if (separatorIndex === -1) {
    return null
  }

  const encodedPayload = value.slice(0, separatorIndex)
  const signature = value.slice(separatorIndex + 1)
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('hex')

  if (signature.length !== expectedSignature.length) {
    return null
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null
  }

  try {
    const rawPayload = decodeURIComponent(encodedPayload)
    const parsedPayload = JSON.parse(rawPayload) as Partial<SessionPayload>

    if (
      typeof parsedPayload.username !== 'string' ||
      typeof parsedPayload.expiresAt !== 'number' ||
      !Number.isFinite(parsedPayload.expiresAt)
    ) {
      return null
    }

    return {
      username: parsedPayload.username,
      expiresAt: parsedPayload.expiresAt,
    }
  } catch {
    return null
  }
}

export function createDocsAdminAuth(options: DocsAdminAuthOptions = {}) {
  const username = options.username?.trim() || null
  const password = options.password?.trim() || null

  if ((username && !password) || (!username && password)) {
    throw new Error('Admin auth requires both username and password')
  }

  const authEnabled = Boolean(username && password)
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS

  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds <= 0) {
    throw new Error(`Invalid admin session TTL: ${sessionTtlSeconds}`)
  }

  const sessionSecret = createHash('sha256')
    .update(`${username ?? ''}:${password ?? ''}:bwiki-docs-admin`)
    .digest()

  function clearSession(response: Response) {
    response.clearCookie(ADMIN_SESSION_COOKIE, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    })
  }

  function createSessionToken(currentUsername: string) {
    const payload: SessionPayload = {
      username: currentUsername,
      expiresAt: Date.now() + sessionTtlSeconds * 1000,
    }
    const encodedPayload = encodeURIComponent(JSON.stringify(payload))
    const signature = createHmac('sha256', sessionSecret).update(encodedPayload).digest('hex')
    return `${encodedPayload}.${signature}`
  }

  function getSession(request: Request): DocsAdminSessionState {
    if (!authEnabled) {
      return {
        authEnabled: false,
        authenticated: true,
        username: null,
      }
    }

    const cookies = parseCookieHeader(request.headers.cookie)
    const payload = parseSessionPayload(cookies.get(ADMIN_SESSION_COOKIE) ?? null, sessionSecret)

    if (!payload || payload.expiresAt <= Date.now() || payload.username !== username) {
      return {
        authEnabled: true,
        authenticated: false,
        username: null,
      }
    }

    return {
      authEnabled: true,
      authenticated: true,
      username: payload.username,
    }
  }

  function authenticateCredentials(input: { password: string; username: string }) {
    if (!authEnabled || !username || !password) {
      return false
    }

    return credentialMatches(input.username, username) && credentialMatches(input.password, password)
  }

  function setAuthenticatedSession(response: Response) {
    if (!authEnabled || !username) {
      return
    }

    response.cookie(ADMIN_SESSION_COOKIE, createSessionToken(username), {
      encode: (value) => value,
      httpOnly: true,
      maxAge: sessionTtlSeconds * 1000,
      path: '/',
      sameSite: 'lax',
    })
  }

  function requireAuth(request: Request, response: Response, next: NextFunction) {
    const session = getSession(request)

    if (session.authenticated) {
      next()
      return
    }

    clearSession(response)
    response.status(401).json({
      error: 'Authentication required',
    })
  }

  return {
    authEnabled,
    authenticateCredentials,
    clearSession,
    getSession,
    requireAuth,
    setAuthenticatedSession,
  }
}
