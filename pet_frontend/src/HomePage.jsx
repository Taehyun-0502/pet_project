import { useNavigate } from 'react-router-dom'
import { useAuth } from './member/AuthContext'

// 임시 홈 — RequireLogin이 감싸므로 이 컴포넌트에서 user는 항상 존재한다.
// 이후 반려동물 목록 화면으로 교체될 자리
export default function HomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = () => {
    logout() // 저장된 토큰 삭제 + user 초기화 (1차 정의: 서버 호출 없음)
    navigate('/login', { replace: true })
  }

  return (
    <main className="auth-page">
      <h1>홈</h1>
      <p>
        {user.name}님, 환영합니다. ({user.email})
      </p>
      <p>여기는 앞으로 반려동물 목록이 표시될 자리입니다.</p>
      <button type="button" onClick={onLogout}>
        로그아웃
      </button>
    </main>
  )
}
