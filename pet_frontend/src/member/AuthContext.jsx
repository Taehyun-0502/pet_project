import { createContext, useContext, useEffect, useState } from 'react'
import { clearToken, getToken, saveToken } from '../common/apiClient'
import { getMyInfo, login as loginApi, logout as logoutApi } from './memberApi'

// 로그인 상태의 중앙 관리소.
// 어느 화면이든 useAuth()로 { user, restoring, login, logout }을 꺼내 쓴다
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // user: 로그인한 회원 정보 { id, email, name, role }. null이면 미로그인
  const [user, setUser] = useState(null)
  // restoring: 새로고침 직후 저장된 토큰으로 상태를 복원하는 중인지.
  // 복원이 끝나기 전에 가드가 "미로그인"으로 판단해 로그인으로 튕기는 것을 막는다
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setRestoring(false)
      return
    }
    getMyInfo()
      .then(setUser)
      .catch(() => clearToken()) // 토큰 만료·위조·탈퇴 계정 — 버리고 미로그인으로
      .finally(() => setRestoring(false))
  }, [])

  const login = async ({ email, password }) => {
    const data = await loginApi({ email, password })
    saveToken(data.accessToken)
    setUser(data.user)
  }

  /**
   * 로그아웃 — 서버의 리프레시 토큰까지 폐기해야 다른 곳에서 재발급으로 세션이 이어지지 않는다.
   * 서버 호출이 실패하더라도 이 기기에서는 로그아웃된 것으로 처리한다
   * (남은 리프레시 토큰은 14일 뒤 만료되고, 사용자를 로그인 화면에 붙잡아 둘 이유가 없다).
   */
  const logout = async () => {
    try {
      await logoutApi()
    } catch {
      // 네트워크 오류 등 — 아래 정리는 그대로 진행한다
    }
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, restoring, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
