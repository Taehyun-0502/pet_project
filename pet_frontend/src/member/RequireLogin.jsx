import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

// 로그인 가드 — 보호가 필요한 화면을 감싸서 사용한다.
// <RequireLogin><HomePage /></RequireLogin> 처럼 감싸면
// 미로그인 시 화면 대신 로그인 페이지로 보낸다
export default function RequireLogin({ children }) {
  const { user, restoring } = useAuth()

  // 새로고침 복원이 끝나기 전에는 판단을 보류 — 로그인된 사용자가
  // 복원 중 잠깐 /login으로 튕기는 오동작을 막는다
  if (restoring) {
    return (
      <main>
        <p>불러오는 중…</p>
      </main>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
