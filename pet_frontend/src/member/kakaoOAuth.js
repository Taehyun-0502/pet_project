// 카카오 인가 요청 — URL 구성과 state(CSRF 방지) 관리 (docs/api-spec.md 1절 4차).
// code를 백엔드로 넘긴 뒤의 처리는 memberApi.kakaoLogin이 담당한다.

import { KAKAO_CLIENT_ID } from '../config'

// 인가 요청과 토큰 교환에 같은 값을 써야 한다 — 카카오가 등록된 URI인지 검증한다
export const KAKAO_REDIRECT_URI = `${window.location.origin}/oauth/kakao`

const STATE_KEY = 'kakaoOauthState'

// 카카오 인가 페이지로 이동한다. state는 콜백에서 대조해 위조 리다이렉트를 걸러낸다
export function startKakaoLogin() {
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: KAKAO_CLIENT_ID,
    redirect_uri: KAKAO_REDIRECT_URI,
    response_type: 'code',
    state,
  })
  window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`
}

// 저장된 state를 꺼내면서 지운다 — 1회용이라 재사용 여지를 남기지 않는다
export function consumeKakaoState() {
  const saved = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  return saved
}
