// 스마트폰 등 모바일 기기로 접속 시 브라우저 접속 IP(window.location.hostname)를 백엔드 포트와 동적 자동 매핑
const getDynamicUrl = (targetUrl, defaultPort) => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    // 팀장님 정식 HTTPS 도메인 (dddang.duckdns.org) 및 가상 터널 도메인인 경우 정식 호스트 자동 매핑
    if (hostname.includes('dddang.duckdns.org') || hostname.includes('duckdns.org') || hostname.includes('trycloudflare.com') || hostname.includes('ngrok')) {
      return `${window.location.protocol}//${hostname}${window.location.port ? ':' + window.location.port : ''}`
    }
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:${defaultPort}`
    }
  }
  return targetUrl || `http://localhost:${defaultPort}`
}

export const BACKEND_URL = getDynamicUrl(import.meta.env.VITE_BACKEND_URL, 8080)
export const PYTHON_URL = getDynamicUrl(import.meta.env.VITE_PYTHON_URL, 8000)

// 카카오 OAuth REST API 키 (인가 URL용 — 공개 값이라 프론트 노출 무해, api-spec.md 1절 4차)
export const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID
