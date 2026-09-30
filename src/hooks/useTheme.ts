import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'my-stock-portfolio-theme'

const preferredTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? preferredTheme() : theme }
    apply()
    media.addEventListener('change', apply)
    localStorage.setItem(KEY, theme)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return { theme, setTheme }
}
