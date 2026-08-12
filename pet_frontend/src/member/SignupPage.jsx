import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Field from '../common/Field'
import { useForm } from '../common/useForm'
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

// 이메일 중복은 필드 오류다 — 폼 하단이 아니라 이메일 입력 아래에 붙여야 어디를 고칠지 보인다
function mapError(err) {
  return err.code === 'AUTH_EMAIL_DUPLICATED' ? { email: err.message } : null
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  // 방금 이 화면에서 가입해 자동 로그인이 진행 중인지.
  // 이게 없으면 로그인으로 user가 채워지는 순간 아래 가드가 먼저 홈으로 보내버려
  // 온보딩 화면(/welcome)에 닿지 못한다
  const [signedUp, setSignedUp] = useState(false)

  const form = useForm({
    initialValues: { email: '', password: '', passwordConfirm: '', name: '' },
    validate,
    mapError,
    onSubmit: async (values) => {
      const email = values.email.trim()
      await signup({ email, password: values.password, name: values.name.trim() })

      // 가입 성공. 온보딩 화면에서 바로 반려동물을 등록하려면 토큰이 있어야 하는데
      // 가입 응답에는 토큰이 없으므로(명세) 방금 입력한 자격 증명으로 로그인을 이어서 호출한다.
      // 여기부터의 실패는 폼 오류가 아니므로 useForm의 catch에 맡기지 않고 직접 처리한다
      setSignedUp(true)
      try {
        await login({ email, password: values.password })
        navigate('/welcome', { replace: true, state: { fromSignup: true } })
      } catch {
        // 가입 자체는 이미 성공했으니 되돌리지 않고 로그인 화면으로 안내한다
        navigate('/login', { replace: true, state: { signupEmail: email } })
      }
    },
  })

  // 이미 로그인한 상태면 가입 화면 대신 홈으로 (훅 호출 뒤에 둔다)
  if (user && !signedUp) return <Navigate to="/" replace />

  return (
    <main className="auth-page">
      <h1>회원가입</h1>
      <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
        <Field form={form} name="email" label="이메일" type="email" autoComplete="email" />
        <Field
          form={form} name="password" label={`비밀번호 (${PASSWORD_RULE_LABEL})`}
          type="password" autoComplete="new-password"
        />
        <Field
          form={form} name="passwordConfirm" label="비밀번호 확인"
          type="password" autoComplete="new-password"
        />
        <Field form={form} name="name" label="이름" type="text" autoComplete="name" />
        {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
        <button type="submit" disabled={form.submitting}>
          {form.submitting ? '가입 중…' : '가입하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/login">이미 계정이 있으신가요? 로그인</Link>
      </p>
    </main>
  )
}
