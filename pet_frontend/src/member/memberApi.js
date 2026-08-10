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

// 카카오 로그인 — 인가 코드를 백엔드로 넘기면 토큰 교환·가입까지 처리된다.
// 성공 응답은 login과 완전히 동일 (api-spec.md 1절 4차)
export function kakaoLogin({ code, redirectUri }) {
  return request('/api/members/login/kakao', { method: 'POST', body: { code, redirectUri } })
}

// 성공 시 { id, email, name, role } — 저장된 토큰으로 로그인 상태 복원에 사용
export function getMyInfo() {
  return request('/api/members/me')
}

// 서버에 저장된 리프레시 토큰을 폐기하고 쿠키를 지운다. 쿠키가 없어도 성공(멱등)
export function logout() {
  return request('/api/members/logout', { method: 'POST' })
}

// 이름 수정. 성공 시 갱신된 { id, email, name, role } — GET /me와 동일 형태
export function updateMyName({ name }) {
  return request('/api/members/me', { method: 'PATCH', body: { name } })
}

// 비밀번호 변경. 성공 시 다른 기기의 리프레시 토큰은 전부 폐기되고
// 이 기기에는 새 토큰이 쿠키로 내려와 로그인이 유지된다 (api-spec.md 1절)
export function changePassword({ currentPassword, newPassword }) {
  return request('/api/members/me/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  })
}

// 액세스 토큰 재발급은 apiClient가 401을 만나면 자동으로 처리한다 — 화면에서 직접 부를 일이 없다
