// 백엔드·AI 서버 주소 결정 (배포·LAN·로컬 세 상황을 한 규칙으로)

const LOCAL_HOSTS = ['localhost', '127.0.0.1']
const isLocalHost = (host) => LOCAL_HOSTS.includes(host)

/**
 * 주소 결정 규칙 — **설정값이 원격 주소면 무조건 그대로 쓴다** (백로그 115번).
 *
 * 종전 로직은 브라우저 hostname이 localhost가 아니면 `VITE_BACKEND_URL`을 **무시하고**
 * `{protocol}//{hostname}:8080`을 조립했다. 휴대폰(LAN IP) 접속 편의를 위한 것이었지만
 * **배포에서는 치명적이다** — 배포 도메인에서 백엔드가 8080 포트에 그대로 노출되는 경우는 없으므로
 * (같은 오리진 + 리버스 프록시이거나 별도 API 호스트) 배포 즉시 모든 API가 잘못된 주소로 나간다.
 *
 * 그래서 동적 매핑은 **설정값이 localhost일 때만** 적용한다. 두 요구가 다 성립한다:
 * - 배포: `VITE_BACKEND_URL=https://api.example.com` → 그대로 사용
 * - LAN 테스트: 설정값이 `http://localhost:8080`인 채 휴대폰이 `http://192.168.0.9:5173`으로 접속
 *   → 백엔드도 `http://192.168.0.9:8080`으로 (포트는 설정값의 포트를 유지한다 — 8081 개발 조합 대응)
 */
export function resolveApiUrl(
  configured,
  defaultPort,
  browserHost = typeof window === 'undefined' ? null : window.location.hostname,
  browserProtocol = typeof window === 'undefined' ? 'http:' : window.location.protocol,
) {
  const target = configured || `http://localhost:${defaultPort}`
  if (!browserHost) return target
  if (isLocalHost(browserHost)) return target

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return target // 형식이 깨진 설정값 — 손대지 않고 그대로 둔다(원인이 드러나야 한다)
  }

  // 설정값이 이미 원격을 가리키면 그것이 유일한 진실이다 (배포)
  if (!isLocalHost(parsed.hostname)) return target

  // dddang.duckdns.org 등 도메인 접속 처리
  if (browserHost.includes('duckdns.org') || browserHost.includes('trycloudflare.com') || browserHost.includes('ngrok')) {
    return `${browserProtocol}//${browserHost}${window.location.port ? ':' + window.location.port : ''}`
  }

  return `${browserProtocol}//${browserHost}:${parsed.port || defaultPort}`
}

export const BACKEND_URL = resolveApiUrl(import.meta.env.VITE_BACKEND_URL, 8080)

// AI(FastAPI) 서버 — 현재 프론트에서 참조하는 화면이 없다(모델 호출은 백엔드 경유).
// 사용처가 생길 때까지 남겨두는 예비 export다 (백로그 58번)
export const PYTHON_URL = resolveApiUrl(import.meta.env.VITE_PYTHON_URL, 8000)

/**
 * 카카오 OAuth REST API 키 (인가 URL용 — 공개 값이라 프론트 노출 무해, api-spec.md 1절 4차).
 *
 * 미설정이면 `undefined`가 인가 URL의 `client_id`로 들어가 카카오 오류 페이지가 뜨는데,
 * 화면에는 원인이 드러나지 않는다 (백로그 58·89번). 그래서 여기서 값의 유무를 노출해
 * 호출부(kakaoOAuth.startKakaoLogin)가 사용자에게 안내할 수 있게 한다 —
 * 이 파일에서 throw하지는 않는다: 카카오를 쓰지 않는 화면까지 앱 전체가 죽는다
 */
export const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID
export const IS_KAKAO_CONFIGURED = Boolean(KAKAO_CLIENT_ID)
