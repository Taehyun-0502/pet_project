// 스마트폰 등 모바일 기기로 접속 시 브라우저 접속 IP(window.location.hostname)를 백엔드 포트와 동적 자동 매핑
//
// (2026-08-24 배포 대응 — 팀 공유 필요) 환경변수가 "실제 배포 주소"를 가리키면 그걸 최우선한다.
// 배포(https://dddang.duckdns.org)에서는 리버스 프록시가 /api를 백엔드로 넘기는 단일 오리진이라
// 기존 동적 매핑(같은 호스트:8080)이 오히려 잘못된 주소를 만들기 때문. 로컬 .env의
// localhost 값은 이 분기에 걸리지 않으므로 기존 LAN 테스트 동작(폰 접속 시 동적 매핑)은 그대로다.
const isLocalUrl = (url) => !url || url.includes('localhost') || url.includes('127.0.0.1')

const getDynamicUrl = (targetUrl, defaultPort) => {
  if (!isLocalUrl(targetUrl)) {
    return targetUrl
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:${defaultPort}`
  }
  return targetUrl || `http://localhost:${defaultPort}`
}

export const BACKEND_URL = getDynamicUrl(import.meta.env.VITE_BACKEND_URL, 8080);
export const PYTHON_URL = getDynamicUrl(import.meta.env.VITE_PYTHON_URL, 8000);

// 카카오 OAuth REST API 키 (인가 URL용 — 공개 값이라 프론트 노출 무해, api-spec.md 1절 4차)
export const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID;
