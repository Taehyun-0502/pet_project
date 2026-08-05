// 인증 관련 API 호출 함수 모음 (docs/api-spec.md 1절과 1:1)

import { request } from '../common/apiClient'

// 성공 시 { id, email, name, role }
export function signup({ email, password, name }) {
  return request('/api/members/signup', { method: 'POST', body: { email, password, name } })
}

// 성공 시 { accessToken, tokenType, expiresIn, user }
export function login({ email, password }) {
  return request('/api/members/login', { method: 'POST', body: { email, password } })
}

// 성공 시 { id, email, name, role } — 저장된 토큰으로 로그인 상태 복원에 사용
export function getMyInfo() {
  return request('/api/members/me')
}
