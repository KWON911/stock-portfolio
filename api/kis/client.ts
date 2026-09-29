type KisResponse = { rt_cd?: string; msg1?: string; output?: Record<string, unknown> }
type TokenCache = { value: string; expiresAt: number }
let cachedToken: TokenCache | null = null

const baseUrl = () => process.env.KIS_BASE_URL || (process.env.KIS_ENV === 'demo' ? 'https://openapivts.koreainvestment.com:29443' : 'https://openapi.koreainvestment.com:9443')
const credentials = () => ({ appKey: process.env.KIS_APP_KEY, appSecret: process.env.KIS_APP_SECRET })

export async function kisAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value
  const { appKey, appSecret } = credentials()
  if (!appKey || !appSecret) throw new Error('KIS credentials are not configured')
  const response = await fetch(`${baseUrl()}/oauth2/tokenP`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }) })
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!response.ok || !body.access_token) throw new Error('KIS token request failed')
  cachedToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 21_600) * 1000 }
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
