import type { ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { useAuth } from '../hooks/useAuth'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, signIn } = useAuth()

  if (loading) {
    return (
      <div className="login-page">
        <p>로그인 상태 확인 중...</p>
      </div>
    )
  }

  if (!session) {
    return <LoginPage onSignIn={signIn} />
  }

  return <>{children}</>
}