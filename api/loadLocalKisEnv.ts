import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const KIS_ENV_KEYS = ['KIS_APP_KEY', 'KIS_APP_SECRET'] as const
let attempted = false

/**
 * Vercel dev can start serverless functions without inheriting `.env.local`.
 * Deployed Production and Preview functions keep their Vercel-managed values.
 */
export function loadLocalKisEnv() {
  if (attempted || process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') return
  attempted = true
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  try {
    const values = new Map<string, string>()
    readFileSync(path, 'utf8').split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match || match[1].startsWith('#')) return
      values.set(match[1], match[2].replace(/^['"]|['"]$/g, ''))
    })
    KIS_ENV_KEYS.forEach(key => { if (!process.env[key] && values.get(key)) process.env[key] = values.get(key) })
    console.info('[KIS Local Env]', {
      appKeyConfigured: Boolean(process.env.KIS_APP_KEY),
      appSecretConfigured: Boolean(process.env.KIS_APP_SECRET),
    })
  } catch {
    console.info('[KIS Local Env]', { appKeyConfigured: false, appSecretConfigured: false })
  }
}
