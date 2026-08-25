// 공통 fetch 래퍼 — 모든 API 호출은 이 파일을 거친다.
// 하는 일: BACKEND_URL 결합, 토큰 자동 첨부, 액세스 토큰 만료 시 자동 재발급,
//          ApiResponse{success,data,error} 해석

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

// 서버의 ApiResponse.error(code, message, details)를 담는 예외.
// 화면에서는 err.code로 분기하고 err.message를 기본 안내문으로 쓴다.
// details는 검증 실패에만 실리는 { 필드명: 사유 } 맵 — useForm이 해당 입력 아래에 꽂는다 (백로그 51번)
export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message)
    this.code = code
    this.status = status
    this.details = details ?? null
  }
}

/**
 * 세션 만료 알림 콜백 (백로그 34번). "재로그인 외에는 방법이 없는" 상태 —
 * 재발급 401 거부, 토큰 위조·폐기(AUTH_TOKEN_INVALID) — 에서 발화한다.
 * 이 파일은 React를 모르므로 등록 방식으로 연결한다: AuthContext가 setUser(null)을 등록해
 * RequireLogin이 자연히 /login으로 보낸다(returnTo 포함). 네트워크 오류(status 0)는
 * 세션 만료가 아니므로 **절대 태우지 않는다** (백로그 49번과 같은 구분).
 */
let onSessionExpired = null

export function setOnSessionExpired(handler) {
  onSessionExpired = handler
}

// clearToken과 콜백은 항상 짝으로 — 토큰만 지우면 user가 남아 화면이 굳는다(34번의 원래 증상)
function expireSession() {
  clearToken()
  onSessionExpired?.()
}

/**
 * 진행 중인 재발급 요청. 여러 요청이 동시에 만료를 만나도 재발급은 **한 번만** 나가야 한다 —
 * 서버가 재발급 때마다 토큰을 회전시키므로, 두 번 나가면 늦은 쪽이 이미 폐기된 토큰을 들고 가
 * "재사용 감지"에 걸려 모든 세션이 끊긴다. (채팅 화면은 요청이 겹치기 쉬워 실제로 발생한다)
 */
let refreshPromise = null

/**
 * 액세스 토큰 재발급. REST뿐 아니라 WebSocket 연결(chatSocket)도 이 함수를 쓴다 —
 * 같은 promise를 공유해야 REST와 WS가 동시에 만료를 만나도 재발급이 한 번만 나간다.
 */
export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = requestNewAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// 재발급은 쿠키로 인증하므로 Authorization 헤더를 붙이지 않는다.
// request()를 쓰지 않는 이유: 이 호출이 401이면 다시 재발급을 시도하는 무한 루프가 된다
async function requestNewAccessToken() {
  let response
  try {
    response = await fetch(`${BACKEND_URL}/api/members/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0)
  }

  const payload = await response.json().catch(() => null)
  if (!payload?.success) {
    // 401 = 리프레시 토큰이 만료·폐기됨 — 재로그인 외에는 방법이 없어 세션 만료로 전환한다.
    // 그 외(서버 500 등)는 일시 장애일 수 있으므로 토큰을 남긴다 — 다음 만료 시 재발급을 다시 시도한다
    // (예전에는 모든 실패에 clearToken이었다 — 49번과 같은 구분을 여기에도 적용, 2026-08-24)
    if (response.status === 401) {
      expireSession()
    }
    throw new ApiError(
      payload?.error?.code ?? 'AUTH_INVALID_REFRESH_TOKEN',
      payload?.error?.message ?? '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      response.status,
    )
  }
  saveToken(payload.data.accessToken)
  return payload.data.accessToken
}

// 요청 1회 — 재시도 판단은 호출자(request)가 한다.
// body가 FormData면(파일 업로드) JSON 직렬화·Content-Type 지정을 모두 건너뛴다 —
// Content-Type을 직접 지정하면 multipart 경계(boundary)가 빠져 서버가 본문을 파싱하지 못한다
async function send(path, { method = 'GET', body } = {}) {
  const headers = {}
  const isFormData = body instanceof FormData
  if (body && !isFormData) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      // 리프레시 토큰 쿠키를 주고받기 위해 필요 (docs/api-spec.md 6절)
      credentials: 'include',
    })
  } catch {
    // 서버 미기동, 네트워크 단절 등 — HTTP 응답 자체가 없는 경우
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0)
  }
  return { response, payload: await response.json().catch(() => null) }
}

export async function request(path, options = {}) {
  let { response, payload } = await send(path, options)

  // 액세스 토큰 만료만 자동 재발급 대상이다. 로그인 실패(AUTH_INVALID_CREDENTIALS) 등
  // 다른 401은 재발급해도 결과가 같으므로 그대로 올린다.
  // 재시도는 1회뿐 — 재발급 후에도 만료가 나오면 그 오류를 그대로 노출한다
  if (payload?.success === false && payload.error?.code === 'AUTH_TOKEN_EXPIRED') {
    await refreshAccessToken() // 재발급 자체가 실패하면 여기서 ApiError가 던져진다
    ;({ response, payload } = await send(path, options))
  }

  if (!payload) {
    throw new ApiError('INVALID_RESPONSE', '서버 응답을 해석할 수 없습니다.', response.status)
  }
  if (!payload.success) {
    // 위조·누락 토큰 — 대표 사례는 다른 탭에서 로그아웃한 뒤 이 탭이 낡은 메모리 상태(user)로
    // 요청한 경우다(localStorage는 탭 간 공유라 토큰이 이미 없다). 재발급으로 해결되지 않으므로
    // (그 로그아웃이 리프레시 쿠키도 폐기했다) 세션 만료로 전환한다 (백로그 34번, 2026-08-24 확정 범위)
    if (payload.error.code === 'AUTH_TOKEN_INVALID') {
      expireSession()
    }
    throw new ApiError(
      payload.error.code, payload.error.message, response.status, payload.error.details,
    )
  }
  return payload.data
}
