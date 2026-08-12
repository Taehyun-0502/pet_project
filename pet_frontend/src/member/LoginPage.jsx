import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { startKakaoLogin } from './kakaoOAuth'
import './member.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login } = useAuth()

  // 회원가입 직후 넘어온 경우 이메일을 미리 채워준다
  const signupEmail = location.state?.signupEmail
  // RequireLogin이 넘긴 원래 목적지 — 로그인 후 그리로 되돌아간다 (백로그 47번)
  const from = location.state?.from ?? '/'
  const [form, setForm] = useState({ email: signupEmail ?? '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  // 이미 로그인한 상태면 로그인 화면 대신 목적지(없으면 홈)로
  if (user) return <Navigate to={from} replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = {}
    if (!form.email.trim()) nextErrors.email = '이메일은 필수입니다.'
    if (!form.password) nextErrors.password = '비밀번호는 필수입니다.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: form.email.trim(), password: form.password })
      navigate(from, { replace: true })
    } catch (err) {
      // AUTH_INVALID_CREDENTIALS 등 — 서버 메시지를 그대로 안내
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>로그인</h1>
      {signupEmail && (
        <p className="notice">가입이 완료되었습니다. 로그인해 주세요.</p>
      )}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label>
          이메일
          <input
            type="email" name="email" value={form.email} onChange={onChange}
            aria-invalid={Boolean(errors.email)} autoComplete="email"
          />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </label>
        <label>
          비밀번호
          <input
            type="password" name="password" value={form.password} onChange={onChange}
            aria-invalid={Boolean(errors.password)} autoComplete="current-password"
          />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </label>
        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
        {/* 인가 페이지로 이동하므로 submit이 아니라 일반 버튼 — 폼 검증을 타면 안 된다 */}
        <button type="button" className="kakao-login" onClick={startKakaoLogin}>
          카카오로 시작하기
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/signup">계정이 없으신가요? 회원가입</Link>
      </p>
    </main>
  )
}
