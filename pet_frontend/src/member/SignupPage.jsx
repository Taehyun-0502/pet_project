import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { signup } from './memberApi'
import './member.css'

// 서버(SignupRequest)와 같은 규칙으로 1차 검증 — 최종 차단은 서버가 한다
function validate(form) {
  const errors = {}
  if (!form.email.trim()) errors.email = '이메일은 필수입니다.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = '이메일 형식이 올바르지 않습니다.'
  else if (form.email.length > 255) errors.email = '이메일은 255자 이하여야 합니다.'

  if (!form.password) errors.password = '비밀번호는 필수입니다.'
  else if (form.password.length < 8 || form.password.length > 60)
    errors.password = '비밀번호는 8자 이상 60자 이하여야 합니다.'

  if (form.passwordConfirm !== form.password)
    errors.passwordConfirm = '비밀번호가 일치하지 않습니다.'

  if (!form.name.trim()) errors.name = '이름은 필수입니다.'
  else if (form.name.trim().length > 50) errors.name = '이름은 50자 이하여야 합니다.'

  return errors
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', name: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 이미 로그인한 상태면 가입 화면 대신 홈으로
  if (user) return <Navigate to="/" replace />

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await signup({ email: form.email.trim(), password: form.password, name: form.name.trim() })
      // 가입 응답에는 토큰이 없으므로(명세) 자동 로그인 없이 로그인 화면으로
      navigate('/login', { state: { signupEmail: form.email.trim() } })
    } catch (err) {
      if (err.code === 'AUTH_EMAIL_DUPLICATED') setErrors({ email: err.message })
      else setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>회원가입</h1>
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
          비밀번호 (8자 이상)
          <input
            type="password" name="password" value={form.password} onChange={onChange}
            aria-invalid={Boolean(errors.password)} autoComplete="new-password"
          />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </label>
        <label>
          비밀번호 확인
          <input
            type="password" name="passwordConfirm" value={form.passwordConfirm} onChange={onChange}
            aria-invalid={Boolean(errors.passwordConfirm)} autoComplete="new-password"
          />
          {errors.passwordConfirm && <p className="field-error">{errors.passwordConfirm}</p>}
        </label>
        <label>
          이름
          <input
            type="text" name="name" value={form.name} onChange={onChange}
            aria-invalid={Boolean(errors.name)} autoComplete="name"
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </label>
        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '가입 중…' : '가입하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/login">이미 계정이 있으신가요? 로그인</Link>
      </p>
    </main>
  )
}
