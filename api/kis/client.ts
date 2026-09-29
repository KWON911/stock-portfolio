type KisResponse = { rt_cd?: string; msg1?: string; output?: Record<string, unknown> }
type TokenCache = { value: string; expiresAt: number }
let cachedToken: TokenCache | null = null
let tokenRequestInFlight: Promise<string> | null = null
let lastTokenIssueAttemptAt = 0
const TOKEN_SAFETY_WINDOW = 5 * 60_000
const MIN_TOKEN_ISSUE_INTERVAL = 10 * 60_000
const runtimeEnv = ((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})

const baseUrl = () => runtimeEnv.KIS_BASE_URL || (runtimeEnv.KIS_ENV === 'demo' ? 'https://openapivts.koreainvestment.com:29443' : 'https://openapi.koreainvestment.com:9443')
const credentials = () => ({ appKey: runtimeEnv.KIS_APP_KEY, appSecret: runtimeEnv.KIS_APP_SECRET })

export async function kisAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_SAFETY_WINDOW) { console.info('[KIS] reusing memory token'); return cachedToken.value }
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
      if (stored && stored.expiresAt > now + TOKEN_SAFETY_WINDOW) { cachedToken = { value: stored.accessToken, expiresAt: stored.expiresAt }; console.info('[KIS] reusing persistent token'); return stored.accessToken }
    } catch { console.warn('[KIS] persistent token store unavailable; memory cache only') }
  } else console.info('[KIS] persistent token store not configured; memory cache only')
  if (lastTokenIssueAttemptAt && now - lastTokenIssueAttemptAt < MIN_TOKEN_ISSUE_INTERVAL) throw new Error('KIS token issuance cooldown active')
  lastTokenIssueAttemptAt = now
  const { appKey, appSecret } = credentials()
  if (!appKey || !appSecret) throw new Error('KIS credentials are not configured')
  console.info('[KIS] issuing new access token')
  const response = await fetch(`${baseUrl()}/oauth2/tokenP`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }) })
  const body = await response.json() as { access_token?: string; expires_in?: number; access_token_token_expired?: string }
  if (!response.ok || !body.access_token) throw new Error('KIS token request failed')
  cachedToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 21_600) * 1000 }
  if (store) { try { await store.set({ accessToken: cachedToken.value, expiresAt: cachedToken.expiresAt }) } catch { console.warn('[KIS] persistent token store write failed') } }
  return cachedToken.value
}

export async function kisGet(path: string, trId: string, params: Record<string, string>) {
  const { appKey, appSecret } = credentials()
  if (!appKey || !appSecret) throw new Error('KIS credentials are not configured')
  const token = await kisAccessToken()
  const url = new URL(path, baseUrl())
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
  const response = await fetch(url, { headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, appkey: appKey, appsecret: appSecret, tr_id: trId } })
  const body = await response.json() as KisResponse
  if (!response.ok || body.rt_cd !== '0' || !body.output) throw new Error(body.msg1 || 'KIS quotation request failed')
  return body.output
}
