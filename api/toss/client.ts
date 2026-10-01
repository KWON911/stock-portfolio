/// <reference types="node" />

type TokenResponse = { access_token?: string; expires_in?: number }
type TossStage = 'oauth_token' | 'quote' | 'exchange_rate'
type TossErrorDetails = { code?: string; message?: string }

type TokenCache = { value: string; expiresAt: number }
let cachedToken: TokenCache | null = null
let tokenRequestInFlight: Promise<string> | null = null
const TOKEN_SAFETY_WINDOW = 5 * 60_000
const BASE_URL = 'https://openapi.tossinvest.com'

export class TossApiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfter?: string | null, readonly endpoint?: string, readonly stage?: TossStage, readonly apiCode?: string, readonly apiMessage?: string) { super(message); this.name = 'TossApiError' }
}

const credentials = () => ({ clientId: process.env.TOSS_CLIENT_ID, clientSecret: process.env.TOSS_CLIENT_SECRET })
const statusMessage = (status: number) => status === 401 ? 'Toss API authentication failed' : status === 403 ? 'Toss API permission denied' : status === 429 ? 'Toss API rate limit exceeded' : status >= 500 ? 'Toss API server error' : 'Toss API request failed'
const asRecord = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 500) : undefined

function errorDetails(body: unknown): TossErrorDetails {
  const root = asRecord(body)
  const nested = asRecord(root?.error)
  return { code: text(nested?.code) ?? text(root?.error), message: text(nested?.message) ?? text(root?.error_description) }
}

function logFailure(error: TossApiError, symbols?: string[]) {
  console.warn('[Toss] request failed', { stage: error.stage, endpoint: error.endpoint, status: error.status, apiCode: error.apiCode, apiMessage: error.apiMessage, retryAfter: error.retryAfter, symbols })
}

export async function tossAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_SAFETY_WINDOW) return cachedToken.value
  if (tokenRequestInFlight) return tokenRequestInFlight
  tokenRequestInFlight = resolveAccessToken(now)
  try { return await tokenRequestInFlight } finally { tokenRequestInFlight = null }
}

async function resolveAccessToken(now: number) {
  const { createTokenStore } = await import('./tokenStore.js')
  const store = createTokenStore()
  if (store) {
    try {
      const stored = await store.get()
      if (stored && stored.expiresAt > now + TOKEN_SAFETY_WINDOW) {
        cachedToken = { value: stored.accessToken, expiresAt: stored.expiresAt }
        console.info('[Toss] reusing persistent token')
        return stored.accessToken
      }
    } catch { console.warn('[Toss] persistent token store unavailable; memory cache only') }
  }

  const { clientId, clientSecret } = credentials()
  if (!clientId || !clientSecret) throw new TossApiError('Toss credentials are not configured')
  const payload = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  let response: Response
  try { response = await fetch(`${BASE_URL}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: payload }) }
  catch {
    const error = new TossApiError('Toss token network request failed', undefined, undefined, '/oauth2/token', 'oauth_token')
    logFailure(error)
    throw error
  }
  let body: TokenResponse = {}
  try { body = await response.json() as TokenResponse } catch { /* Safe, generic error below. */ }
  if (!response.ok || !body.access_token) {
    const details = errorDetails(body)
    const error = new TossApiError(statusMessage(response.status), response.status, response.headers.get('retry-after'), '/oauth2/token', 'oauth_token', details.code, details.message)
    logFailure(error)
    throw error
  }
  cachedToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3_600) * 1000 }
  if (store) {
    try { await store.set({ accessToken: cachedToken.value, expiresAt: cachedToken.expiresAt }) }
    catch { console.warn('[Toss] persistent token store write failed') }
  }
  return cachedToken.value
}

export async function tossGet(path: string, params?: Record<string, string>, context?: { stage: Exclude<TossStage, 'oauth_token'>; symbols?: string[] }) {
  const token = await tossAccessToken()
  const url = new URL(path, BASE_URL)
  Object.entries(params ?? {}).forEach(([name, value]) => url.searchParams.set(name, value))
  let response: Response
  try { response = await fetch(url, { headers: { authorization: `Bearer ${token}` } }) }
  catch {
    const error = new TossApiError('Toss API network request failed', undefined, undefined, path, context?.stage)
    logFailure(error, context?.symbols)
    throw error
  }
  if (!response.ok) {
    let body: unknown
    try { body = await response.json() } catch { /* Keep diagnostics safe and generic for non-JSON responses. */ }
    const details = errorDetails(body)
    const error = new TossApiError(statusMessage(response.status), response.status, response.headers.get('retry-after'), path, context?.stage ?? 'quote', details.code, details.message)
    logFailure(error, context?.symbols)
    throw error
  }
  try { return await response.json() as unknown }
  catch {
    const error = new TossApiError('Toss API returned an invalid response', response.status, undefined, path, context?.stage)
    logFailure(error, context?.symbols)
    throw error
  }
}
