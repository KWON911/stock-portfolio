/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TOSS_ENV_KEYS = ['TOSS_CLIENT_ID', 'TOSS_CLIENT_SECRET'] as const
let attempted = false

/**
 * Vercel's Vite dev command does not automatically inject `.env.local` into
 * serverless functions. Production still uses Vercel-managed process.env.
 */
export function loadLocalTossEnv() {
  if (attempted || TOSS_ENV_KEYS.every(key => process.env[key])) return
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
    TOSS_ENV_KEYS.forEach(key => { if (!process.env[key] && values.get(key)) process.env[key] = values.get(key) })
  } catch {
    // Diagnostics below intentionally report only configured true/false.
  }
}
