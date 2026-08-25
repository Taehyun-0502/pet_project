import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { clearToken, getToken, saveToken, setOnSessionExpired } from '../common/apiClient'
import { getMyInfo, kakaoLogin as kakaoLoginApi, login as loginApi, logout as logoutApi } from './memberApi'

// 로그인 상태의 중앙 관리소.
// 어느 화면이든 useAuth()로 { user, restoring, login, loginWithKakao, logout, updateUser }를 꺼내 쓴다
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // user: 로그인한 회원 정보 { id, email, name, role }. null이면 미로그인
  const [user, setUser] = useState(null)
  // restoring: 새로고침 직후 저장된 토큰으로 상태를 복원하는 중인지.
  // 복원이 끝나기 전에 가드가 "미로그인"으로 판단해 로그인으로 튕기는 것을 막는다
  const [restoring, setRestoring] = useState(true)

  /**
   * 인증 작업 세대 번호 (백로그 90번 — 재검증 9차 권고안).
   * 복원·로그인·로그아웃이 시작될 때 세대를 올리고, 비동기 완료 시점에 자기 세대가
   * 최신일 때만 상태를 반영한다. 카카오 콜백 중 뒤늦게 끝난 복원이 방금 로그인한 계정을
   * 옛 계정으로 되돌리는 경쟁(90번)이 구조적으로 사라진다 — "누가 먼저 끝나는가"가 아니라
   * "누가 나중에 시작했는가"가 이긴다.
   */
  const opSeqRef = useRef(0)

  useEffect(() => {
    // 세션 만료(재발급 불가·토큰 위조) → 앱 상태에 즉시 반영 (백로그 34번).
    // 토큰은 apiClient가 이미 지웠고, 여기서 user를 비우면 RequireLogin이 /login으로 보낸다.
    // 세대를 올려 진행 중이던 복원·로그인 결과도 낡게 만든다 — 만료 통보보다 먼저 시작된
    // 작업이 뒤늦게 setUser로 유령 세션을 되살리는 것을 막는다
    setOnSessionExpired(() => {
      opSeqRef.current += 1
      setUser(null)
    })

    if (!getToken()) {
      setRestoring(false)
    } else {
      const seq = ++opSeqRef.current
      getMyInfo()
        .then((me) => {
          if (seq === opSeqRef.current) setUser(me)
        })
        .catch((err) => {
          // 낡은 세대면 손대지 않는다(그 사이 다른 인증 작업이 토큰을 바꿨다)
          if (seq !== opSeqRef.current) return
          // 네트워크 단절(status 0)은 토큰의 유효성과 무관하다 — 지우면 백엔드 재시작 중
          // 새로고침한 사용자가 멀쩡한 토큰을 잃는다 (백로그 49번). 남겨 두면 서버가
          // 돌아온 뒤 다음 새로고침에서 자동 복원된다. 401 계열(만료·위조·탈퇴)만 버린다
          if (err.status === 0) return
          clearToken()
        })
        .finally(() => setRestoring(false))
    }
    return () => setOnSessionExpired(null)
  }, [])

  const login = async ({ email, password }) => {
    const seq = ++opSeqRef.current
    const data = await loginApi({ email, password })
    if (seq !== opSeqRef.current) return // 그 사이 다른 인증 작업이 시작됨 — 결과 폐기
    saveToken(data.accessToken)
    setUser(data.user)
  }

  // 카카오 로그인 — 응답 계약이 자체 로그인과 동일해 이후 처리도 같다
  const loginWithKakao = async ({ code, redirectUri }) => {
    const seq = ++opSeqRef.current
    const data = await kakaoLoginApi({ code, redirectUri })
    if (seq !== opSeqRef.current) return
    saveToken(data.accessToken)
    setUser(data.user)
  }

  /**
   * 로그아웃 — 서버의 리프레시 토큰까지 폐기해야 다른 곳에서 재발급으로 세션이 이어지지 않는다.
   *
   * 서버 폐기 실패를 삼키지 않고 던진다 (백로그 44번, 2026-08-18 확정). 예전에는 실패해도
   * 로컬만 정리했는데, 그러면 화면은 "로그아웃됨"인데 이 브라우저의 리프레시 쿠키와 서버 토큰이
   * 살아 있어 — 공용 PC라면 다음 사용자가 콘솔 한 줄로 세션을 되살릴 수 있다. 리스크의 실체는
   * "14일 뒤 만료"가 아니라 "같은 브라우저에서 즉시 복구 가능"이다. 로컬 정리는 성공 시에만.
   *
   * forceLocal: 서버가 오래 죽어 있을 때의 탈출구 (2026-08-24 확정) — 폐기를 시도는 하되
   * 실패해도 로컬을 정리하고 화면을 벗어나게 한다. 위 리스크 안내는 호출부 책임.
   */
  const logout = async ({ forceLocal = false } = {}) => {
    // 세대를 올려 진행 중이던 복원·로그인이 로그아웃 뒤에 유령 세션을 되살리지 못하게 한다
    opSeqRef.current += 1
    try {
      await logoutApi()
    } catch (err) {
      if (!forceLocal) throw err
    }
    clearToken()
    setUser(null)
  }

  // 회원 정보 수정(이름 등) 후 서버 응답으로 상태를 맞춘다 —
  // 화면이 각자 setState를 들고 있으면 홈의 "OO님" 같은 표시가 어긋난 채 남는다
  const updateUser = (nextUser) => setUser(nextUser)

  return (
    <AuthContext.Provider value={{ user, restoring, login, loginWithKakao, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
