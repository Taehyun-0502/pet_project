import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Field from '../common/Field'
import Loading from '../common/Loading'
import { useForm } from '../common/useForm'
import { useAuth } from './AuthContext'
import { startKakaoLogin } from './kakaoOAuth'
import PetsIllustration from './PetsIllustration'
import './member.css'

function validate(values) {
  const errors = {}
  if (!values.email.trim()) errors.email = '이메일은 필수입니다.'
  if (!values.password) errors.password = '비밀번호는 필수입니다.'
  return errors
}

// 눈 아이콘 — 비밀번호 표시 토글. 라이브러리 없이 인라인 SVG (색은 currentColor)
function EyeIcon({ off }) {
  return (
    <svg
      viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="m4 4 16 16" />}
    </svg>
  )
}

/**
 * 로그인 — 웜톤 템플릿 리디자인 (2026-08-25 사용자 제공 시안).
 *
 * 이 화면만 Modernist(.mn) 대신 .login 스코프(라운드·크림톤)를 쓴다 — 첫인상 화면이라
 * 무드가 다르다는 사용자 결정. 검증·프리필·returnTo·카카오 로직은 종전 그대로다.
 * 비밀번호 찾기는 시안에서 제외하기로 함 (기능 자체가 아직 없음).
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, restoring, login } = useAuth()
  const [kakaoError, setKakaoError] = useState('') // 카카오 시작 실패 사유 (백로그 58·103번)
  const [showPw, setShowPw] = useState(false)

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

  const pwError = form.errors.password

  return (
    <main className="login">
      <header className="login-brand">
        <span className="login-brand-logo" aria-hidden="true">🐶</span>
        <span className="login-brand-name">댕댕댕</span>
      </header>

      <section className="login-hero">
        <h1>
          우리 아이와
          <br />
          함께하는
          <br />
          <em>더 즐거운 하루</em>
        </h1>
        <p>
          반려생활을 기록하고,
          <br />
          발견하고, 함께 이야기해요
        </p>
        <div className="login-hero-pets" aria-hidden="true">
          <PetsIllustration width="176" />
        </div>
      </section>

      <section className="login-card">
        {signupEmail && <p className="notice">가입이 완료되었습니다. 로그인해 주세요.</p>}
        <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
          {/* 라벨은 시안대로 화면에서 숨기고(placeholder가 대신함) 스크린리더용으로만 남긴다 */}
          <div className="login-field icon-mail">
            <Field
              form={form} name="email" label="이메일"
              type="email" autoComplete="email" placeholder="이메일"
            />
          </div>
          <div className="login-field icon-lock">
            {/* 눈 토글 버튼 때문에 기본 input 대신 children — aria 연결은 Field 기본 input과 동일하게 */}
            <Field form={form} name="password" label="비밀번호">
              <div className="login-pw">
                <input
                  id="field-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  value={form.values.password ?? ''}
                  onChange={form.change}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  aria-invalid={pwError ? 'true' : undefined}
                  aria-describedby={pwError ? 'field-password-error' : undefined}
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </Field>
          </div>

          {/* role="alert"이라 로그인 실패가 스크린리더에도 읽힌다 (백로그 52번) */}
          {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
          <button type="submit" className="login-submit" disabled={form.submitting}>
            {form.submitting ? '로그인 중…' : '이메일로 로그인'}
          </button>

          <div className="login-or" aria-hidden="true">또는</div>

          {/* 인가 페이지로 이동하므로 submit이 아니라 일반 버튼 — 폼 검증을 타면 안 된다.
              실패 사유(키 미설정·난수 불가)를 문자열로 돌려주므로 화면에 띄운다 (백로그 58·103번) */}
          <button
            type="button"
            className="login-kakao"
            onClick={() => setKakaoError(startKakaoLogin() ?? '')}
          >
            카카오로 시작하기
          </button>
          {kakaoError && <p className="submit-error" role="alert">{kakaoError}</p>}
        </form>
        <p className="login-switch">
          계정이 없나요? <Link to="/signup">회원가입</Link>
        </p>
      </section>
    </main>
  )
}
