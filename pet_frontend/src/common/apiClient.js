// 공통 fetch 래퍼 — 모든 API 호출은 이 파일을 거친다.
// 하는 일: BACKEND_URL 결합, 토큰 자동 첨부, ApiResponse{success,data,error} 해석

import { BACKEND_URL } from '../config'

const TOKEN_KEY = 'accessToken'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// 서버의 ApiResponse.error(code, message)를 담는 예외.
// 화면에서는 err.code로 분기하고 err.message를 기본 안내문으로 쓴다
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function request(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // 서버 미기동, 네트워크 단절 등 — HTTP 응답 자체가 없는 경우
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0)
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new ApiError('INVALID_RESPONSE', '서버 응답을 해석할 수 없습니다.', response.status)
  }
  if (!payload.success) {
    throw new ApiError(payload.error.code, payload.error.message, response.status)
  }
  return payload.data
}
