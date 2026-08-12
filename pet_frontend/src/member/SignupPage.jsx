import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { signup } from './memberApi'
import { PASSWORD_RULE_LABEL, passwordRuleError } from './passwordRules'
import './member.css'

// 서버(SignupRequest)와 같은 규칙으로 1차 검증 — 최종 차단은 서버가 한다
function validate(form) {
  const errors = {}
  if (!form.email.trim()) errors.email = '이메일은 필수입니다.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = '이메일 형식이 올바르지 않습니다.'
  else if (form.email.length > 255) errors.email = '이메일은 255자 이하여야 합니다.'

  if (!form.password) errors.password = '비밀번호는 필수입니다.'
  else {
    const ruleError = passwordRuleError(form.password)
    if (ruleError) errors.password = ruleError
  }

  if (form.passwordConfirm !== form.password)
    errors.passwordConfirm = '비밀번호가 일치하지 않습니다.'

  if (!form.name.trim()) errors.name = '이름은 필수입니다.'
  else if (form.name.trim().length > 50) errors.name = '이름은 50자 이하여야 합니다.'

  return errors
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', name: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 방금 이 화면에서 가입해 자동 로그인이 진행 중인지.
  // 이게 없으면 로그인으로 user가 채워지는 순간 아래 가드가 먼저 홈으로 보내버려
  // 온보딩 화면(/welcome)에 닿지 못한다
  const [signedUp, setSignedUp] = useState(false)

  // 이미 로그인한 상태면 가입 화면 대신 홈으로
  if (user && !signedUp) return <Navigate to="/" replace />

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const email = form.email.trim()
    try {
      await signup({ email, password: form.password, name: form.name.trim() })
    } catch (err) {
      if (err.code === 'AUTH_EMAIL_DUPLICATED') setErrors({ email: err.message })
      else setSubmitError(err.message)
      setSubmitting(false)
      return
    }

    // 가입 성공. 온보딩 화면에서 바로 반려동물을 등록하려면 토큰이 있어야 하는데
    // 가입 응답에는 토큰이 없으므로(명세) 방금 입력한 자격 증명으로 로그인을 이어서 호출한다
    setSignedUp(true)
    try {
      await login({ email, password: form.password })
      navigate('/welcome', { replace: true, state: { fromSignup: true } })
    } catch {
      // 가입 자체는 이미 성공했으니 되돌리지 않고 로그인 화면으로 안내한다
      navigate('/login', { replace: true, state: { signupEmail: email } })
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
          비밀번호 ({PASSWORD_RULE_LABEL})
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
