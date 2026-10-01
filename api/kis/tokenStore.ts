/// <reference types="node" />

export interface StoredToken { accessToken: string; expiresAt: number }
export interface TokenStore {
  get(): Promise<StoredToken | null>
  set(token: StoredToken): Promise<void>
  tryAcquireIssueLock(owner: string): Promise<boolean>
  releaseIssueLock(owner: string): Promise<void>
}

const TOKEN_KEY = 'kis:access-token:production'
const ISSUE_LOCK_KEY = 'kis:token-issue-lock:production'
const ISSUE_LOCK_TTL_SECONDS = 60

const restUrl = () => process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const restToken = () => process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

async function command(parts: string[]) {
  const base = restUrl()
  const token = restToken()
  if (!base || !token) throw new Error('KIS Redis token store is not configured')
  const response = await fetch(`${base}/${parts.map(encodeURIComponent).join('/')}`, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('KIS Redis token store request failed')
  return response.json() as Promise<{ result?: unknown }>
}

export function createTokenStore(): TokenStore | null {
  if (!restUrl() || !restToken()) return null
  return {
    async get() {
      const { result } = await command(['get', TOKEN_KEY])
      if (typeof result !== 'string') return null
      try {
        const token = JSON.parse(result) as StoredToken
        return typeof token.accessToken === 'string' && Number.isFinite(token.expiresAt) ? token : null
      } catch { return null }
    },
    async set(token) {
      const seconds = Math.max(60, Math.floor((token.expiresAt - Date.now()) / 1000))
      await command(['set', TOKEN_KEY, JSON.stringify(token), 'EX', String(seconds)])
    },
    async tryAcquireIssueLock(owner) {
      const { result } = await command(['set', ISSUE_LOCK_KEY, owner, 'NX', 'EX', String(ISSUE_LOCK_TTL_SECONDS)])
      return result === 'OK'
    },
    async releaseIssueLock(owner) {
      // Release only when this owner still holds the lock; a delayed function
      // must never delete a newer instance's lock.
      await command(['eval', 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end', '1', ISSUE_LOCK_KEY, owner])
    },
  }
}
