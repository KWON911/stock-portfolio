export interface StoredToken { accessToken: string; expiresAt: number }
export interface TokenStore { get(): Promise<StoredToken | null>; set(token: StoredToken): Promise<void>; remove(): Promise<void> }

const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const KEY = 'kis:access-token:production'

// Vercel's Upstash integration uses the longer KV_REST_API names. Keep the
// original names as a fallback for existing deployments and local setups.
const restUrl = () =>
  runtimeEnv.UPSTASH_REDIS_REST_KV_REST_API_URL || runtimeEnv.UPSTASH_REDIS_REST_URL

const restToken = () =>
  runtimeEnv.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || runtimeEnv.UPSTASH_REDIS_REST_TOKEN

const configured = () => Boolean(restUrl() && restToken())

async function command(parts: string[]) {
  const base = restUrl()
  const token = restToken()
  if (!base || !token) throw new Error('persistent token store is not configured')
  const response = await fetch(`${base}/${parts.map(encodeURIComponent).join('/')}`, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('persistent token store request failed')
  return response.json() as Promise<{ result?: unknown }>
}

export function createTokenStore(): TokenStore | null {
  if (!configured()) return null
  return {
    async get() {
      const { result } = await command(['get', KEY])
      if (typeof result !== 'string') return null
      try { const token = JSON.parse(result) as StoredToken; return typeof token.accessToken === 'string' && Number.isFinite(token.expiresAt) ? token : null } catch { return null }
    },
    async set(token) {
      const seconds = Math.max(60, Math.floor((token.expiresAt - Date.now()) / 1000))
      await command(['set', KEY, JSON.stringify(token), 'EX', String(seconds)])
    },
    async remove() { await command(['del', KEY]) },
  }
}
