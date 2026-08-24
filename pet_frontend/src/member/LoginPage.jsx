import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Field from '../common/Field'
import Loading from '../common/Loading'
import { useForm } from '../common/useForm'
import { useAuth } from './AuthContext'
import { startKakaoLogin } from './kakaoOAuth'
import './member.css'

function validate(values) {
  const errors = {}
  if (!values.email.trim()) errors.email = '이메일은 필수입니다.'
  if (!values.password) errors.password = '비밀번호는 필수입니다.'
  return errors
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, restoring, login } = useAuth()

  // 회원가입 직후 넘어온 경우 이메일을 미리 채워준다
  const signupEmail = location.state?.signupEmail
  // RequireLogin이 넘긴 원래 목적지 — 로그인 후 그리로 되돌아간다 (백로그 47번)
  const from = location.state?.from ?? '/'

  const form = useForm({
    initialValues: { email: signupEmail ?? '', password: '' },
    validate,
    onSubmit: async (values) => {
      await login({ email: values.email.trim(), password: values.password })
      navigate(from, { replace: true })
    },
  })

  // 복원이 끝나기 전에는 폼을 그리지 않는다 (백로그 64번) — 로그인된 사용자가 /login을 열면
  // 폼이 렌더된 뒤 홈으로 튕겨 입력값이 사라지는 깜빡임이 있었다. RequireLogin과 같은 보류 방식
  if (restoring) return <Loading />
  // 이미 로그인한 상태면 로그인 화면 대신 목적지(없으면 홈)로.
  // 훅 호출 뒤에 둬야 조건부 훅이 되지 않는다
  if (user) return <Navigate to={from} replace />

  return (
    <main className="auth-page">
      <h1>로그인</h1>
      {signupEmail && (
        <p className="notice">가입이 완료되었습니다. 로그인해 주세요.</p>
      )}
      <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
        <Field form={form} name="email" label="이메일" type="email" autoComplete="email" />
        <Field
          form={form} name="password" label="비밀번호"
          type="password" autoComplete="current-password"
        />
        {/* role="alert"이라 로그인 실패가 스크린리더에도 읽힌다 (백로그 52번) */}
        {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
        <button type="submit" disabled={form.submitting}>
          {form.submitting ? '로그인 중…' : '로그인'}
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
