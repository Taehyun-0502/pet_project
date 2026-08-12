import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * 로그인 가드. 두 가지로 쓴다:
 * - 레이아웃 라우트(기본): <Route element={<RequireLogin />}> 아래의 자식 라우트 전부를 한 번에 보호 —
 *   App.jsx에서 화면마다 래핑을 반복하다 새 경로에서 빠뜨리면 조용히 공개 경로가 되던 구조를 제거 (2026-08-11)
 * - 개별 래핑(호환): <RequireLogin><Page /></RequireLogin>
 */
export default function RequireLogin({ children }) {
  const { user, restoring } = useAuth()
  const location = useLocation()

  // 새로고침 복원이 끝나기 전에는 판단을 보류 — 로그인된 사용자가
  // 복원 중 잠깐 /login으로 튕기는 오동작을 막는다
  if (restoring) {
    return (
      <main>
        <p>불러오는 중…</p>
      </main>
    )
  }
  if (!user) {
    // 원래 목적지를 state로 넘겨 로그인 후 되돌아온다 (백로그 47번 —
    // 공유받은 채팅방 링크가 로그인을 거치면 항상 홈으로 떨어지던 문제)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children ?? <Outlet />
}
