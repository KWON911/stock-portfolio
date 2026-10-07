import { useState, type FormEvent } from 'react'

export function LoginPage({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    setSubmitting(true)
    setError(null)

    const result = await onSignIn(email, password)

    setSubmitting(false)

    if (result.error) {
      setError('이메일 또는 비밀번호를 확인해 주세요.')
    }
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <p>Personal Portfolio</p>
          <h1>주식 포트폴리오</h1>
          <span>이메일과 비밀번호로 로그인하세요.</span>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            이메일
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </section>
    </div>
  )
}
