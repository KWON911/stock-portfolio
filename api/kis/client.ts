/// <reference types="node" />

import type { StoredToken, TokenStore } from './tokenStore.js'

type KisResponse = { rt_cd?: string; msg_cd?: string; msg1?: string; output?: Record<string, unknown> }
type TokenResponse = { access_token?: string; expires_in?: number }
type TokenCache = StoredToken

let cachedToken: TokenCache | null = null
let tokenRequestInFlight: Promise<string> | null = null

const TOKEN_SAFETY_WINDOW_MS = 5 * 60_000
const LOCK_WAIT_TIMEOUT_MS = 8_000
const LOCK_WAIT_INTERVAL_MS = 250
const KIS_BASE_URL = () => process.env.KIS_BASE_URL || (process.env.KIS_ENV === 'demo' ? 'https://openapivts.koreainvestment.com:29443' : 'https://openapi.koreainvestment.com:9443')
const isProduction = () => process.env.VERCEL_ENV === 'production'
const isReusable = (token: TokenCache, now: number) => token.expiresAt > now + TOKEN_SAFETY_WINDOW_MS
const credentials = () => ({ appKey: process.env.KIS_APP_KEY, appSecret: process.env.KIS_APP_SECRET })
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))
const lockOwner = () => `kis-token-${Date.now()}-${Math.random().toString(36).slice(2)}`

function remember(token: TokenCache) {
  cachedToken = token
  return token.accessToken
}

async function storedToken(store: TokenStore, now: number) {
  const token = await store.get()
  return token && isReusable(token, now) ? token : null
}

async function waitForToken(store: TokenStore) {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    await pause(LOCK_WAIT_INTERVAL_MS)
    const token = await storedToken(store, Date.now())
    if (token) return token
  }
  return null
}

async function issueToken(now: number) {
  const { appKey, appSecret } = credentials()
  if (!appKey || !appSecret) throw new Error('KIS credentials are not configured')
  const response = await fetch(`${KIS_BASE_URL()}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }),
  })
  let body: TokenResponse = {}
  try { body = await response.json() as TokenResponse } catch { /* A generic error below prevents logging sensitive request data. */ }
  const expiresIn = Number(body.expires_in)
  if (!response.ok || !body.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('KIS token request failed')
  return { accessToken: body.access_token, expiresAt: now + expiresIn * 1000 }
}

async function resolveWithRedis(store: TokenStore, now: number) {
  const existing = await storedToken(store, now)
  if (existing) {
    console.info('[KIS Token] source=redis')
    return remember(existing)
  }

  const owner = lockOwner()
  const acquired = await store.tryAcquireIssueLock(owner)
  if (!acquired) {
    console.info('[KIS Token] waiting-for-lock')
    const token = await waitForToken(store)
    if (!token) throw new Error('KIS token issuance is in progress; timed out waiting for Redis token')
    console.info('[KIS Token] source=redis')
    return remember(token)
  }

  let persisted = false
  try {
    // A second read after acquiring the distributed lock prevents a duplicate
    // issuance if another request stored a token just before lock acquisition.
    const doubleChecked = await storedToken(store, now)
    if (doubleChecked) {
      console.info('[KIS Token] source=redis')
      return remember(doubleChecked)
    }
    const issued = await issueToken(now)
    await store.set(issued)
    persisted = true
    console.info('[KIS Token] issued=new')
    return remember(issued)
  } finally {
    // Keep the TTL lock after an issuance/store failure to avoid an immediate
    // cross-instance retry storm. A successful persistence can release safely.
    if (persisted) await store.releaseIssueLock(owner)
  }
}

export async function kisAccessToken() {
  const now = Date.now()
  if (cachedToken && isReusable(cachedToken, now)) {
    console.info('[KIS Token] source=memory')
    return cachedToken.accessToken
  }
  if (tokenRequestInFlight) return tokenRequestInFlight
  tokenRequestInFlight = resolveAccessToken(now)
  try { return await tokenRequestInFlight } finally { tokenRequestInFlight = null }
}

async function resolveAccessToken(now: number) {
  const { createTokenStore } = await import('./tokenStore.js')
  const store = createTokenStore()
  if (!store) {
    if (isProduction()) {
      console.warn('[KIS Token] redis-error')
      throw new Error('KIS Redis token store is required in production')
    }
    const issued = await issueToken(now)
    console.info('[KIS Token] issued=new')
    return remember(issued)
  }

  try { return await resolveWithRedis(store, now) }
  catch (error) {
    console.warn('[KIS Token] redis-error')
    if (isProduction()) throw error
    const issued = await issueToken(now)
    console.info('[KIS Token] issued=new')
    return remember(issued)
  }
}

export async function kisGet(path: string, trId: string, params: Record<string, string>) {
  const { appKey, appSecret } = credentials()
  if (!appKey || !appSecret) throw new Error('KIS credentials are not configured')
  const token = await kisAccessToken()
  const url = new URL(path, KIS_BASE_URL())
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
      custtype: 'P',
      tr_cont: '',
    },
  })
  let body: KisResponse = {}
  try { body = await response.json() as KisResponse } catch { /* KIS can return an empty non-JSON error body. */ }
  if (!response.ok || body.rt_cd !== '0' || !body.output) {
    console.warn('[KIS] request failed', {
      endpoint: path,
      trId,
      status: response.status,
      rtCd: body.rt_cd,
      msgCode: body.msg_cd,
      message: body.msg1,
    })
    throw new Error(body.msg1 || 'KIS quotation request failed')
  }
  return body.output
}
