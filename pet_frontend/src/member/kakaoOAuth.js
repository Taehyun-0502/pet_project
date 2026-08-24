// 카카오 인가 요청 — URL 구성과 state(CSRF 방지) 관리 (docs/api-spec.md 1절 4차).
// code를 백엔드로 넘긴 뒤의 처리는 memberApi.kakaoLogin이 담당한다.

import { IS_KAKAO_CONFIGURED, KAKAO_CLIENT_ID } from '../config'

// 인가 요청과 토큰 교환에 같은 값을 써야 한다 — 카카오가 등록된 URI인지 검증한다
export const KAKAO_REDIRECT_URI = `${window.location.origin}/oauth/kakao`

const STATE_KEY = 'kakaoOauthState'

/**
 * CSRF용 1회용 state 생성.
 *
 * `crypto.randomUUID()`는 **보안 컨텍스트(https·localhost)에서만 존재한다** — LAN 주소
 * (`http://192.168.x.x`)로 열면 `undefined`라서 종전에는 클릭 핸들러가 TypeError로 죽고
 * 화면에는 아무 안내가 없었다 (백로그 103번). `crypto.getRandomValues`는 비보안 컨텍스트에도
 * 있으므로 그것으로 대체한다 — 엔트로피는 동일(128비트)하고 형식만 hex다.
 */
function createState() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return null // 난수를 만들 수 없으면 state 없이 진행하지 않는다 (CSRF 방어를 포기하는 셈)
}

/**
 * 카카오 인가 페이지로 이동한다. state는 콜백에서 대조해 위조 리다이렉트를 걸러낸다.
 *
 * @returns 실패 사유 문자열(호출부가 화면에 표시) 또는 성공 시 null.
 *   종전에는 실패가 조용했다 — 키 미설정이면 `client_id=undefined`로 카카오 오류 페이지를 보고,
 *   LAN에서는 TypeError로 죽었다 (백로그 58·103번). 원인을 사용자에게 보여준다
 */
export function startKakaoLogin() {
  if (!IS_KAKAO_CONFIGURED) {
    return '카카오 로그인이 설정되지 않았습니다. (.env의 VITE_KAKAO_CLIENT_ID)'
  }
  const state = createState()
  if (!state) {
    return '이 브라우저에서는 카카오 로그인을 시작할 수 없습니다. 이메일로 로그인해 주세요.'
  }
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: KAKAO_CLIENT_ID,
    redirect_uri: KAKAO_REDIRECT_URI,
    response_type: 'code',
    state,
  })
  window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`
  return null
}

// 저장된 state를 꺼내면서 지운다 — 1회용이라 재사용 여지를 남기지 않는다.
// **호출부는 비교 전에 무조건 이것을 먼저 불러야 한다** (백로그 103번): 단축 평가로 건너뛰면
// 옛 state가 sessionStorage에 남아 "1회용"이라는 계약이 깨진다
export function consumeKakaoState() {
  const saved = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  return saved
}
