import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import './member.css'

// 가입 직후 한 번만 보여주는 온보딩 화면 — 반려동물을 지금 등록할지 물어본다.
// "가입 직후 1회"가 노출 조건이므로 SignupPage가 넘겨준 state로만 들어올 수 있다.
// URL을 직접 치거나 새로고침 아닌 경로로 진입하면 홈으로 보낸다
export default function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  if (!location.state?.fromSignup) return <Navigate to="/" replace />

  // 어느 쪽을 고르든 replace — 뒤로 가기로 이 화면에 다시 돌아오면 1회 노출이 깨진다
  const goRegister = () => navigate('/pets/new', { replace: true })
  const goHome = () => navigate('/', { replace: true })

  return (
    <main className="auth-page">
      <h1>{user.name}님, 환영합니다!</h1>
      <p className="notice">가입이 완료되었습니다.</p>
      {/* 가입은 됐는데 사진만 실패한 경우 (SignupPage의 실패 정책 — 되돌리지 않고 안내만 넘긴다).
          여기서 재시도 UI를 만들지 않는 이유: 마이페이지에 이미 같은 업로드 화면이 있다 */}
      {location.state.photoError && (
        <p className="submit-error" role="alert">
          {location.state.photoError} 마이페이지 → 정보 수정에서 다시 등록할 수 있습니다.
        </p>
      )}
      <p className="muted-note">
        반려동물을 등록하면 건강 기록과 AI 진단을 바로 사용할 수 있어요.
        나중에 홈에서 등록해도 됩니다.
      </p>
      <div className="onboarding-actions">
        <button type="button" className="primary" onClick={goRegister}>
          지금 등록하기
        </button>
        <button type="button" onClick={goHome}>
          나중에 하기
        </button>
      </div>
    </main>
  )
}
