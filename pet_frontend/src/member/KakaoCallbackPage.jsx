import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearToken } from '../common/apiClient'
import { useAuth } from './AuthContext'
import { KAKAO_REDIRECT_URI, consumeKakaoState } from './kakaoOAuth'
import './member.css'

// 카카오 인가 리다이렉트 수신 화면 (/oauth/kakao, docs/api-spec.md 1절 4차).
// code를 백엔드로 넘겨 로그인을 완료한다 — 화면에 머무는 시간은 정상 흐름에서 1초 미만이다.
export default function KakaoCallbackPage() {
  const navigate = useNavigate()
  const { loginWithKakao } = useAuth()
  const [error, setError] = useState('')
  // StrictMode의 이중 effect 실행 가드 — 인가 코드는 1회용이라 두 번 보내면 두 번째가 실패하면서
  // 성공했던 로그인 화면 상태를 오류로 덮어쓴다
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.search)
    // 사용자가 카카오 동의 화면에서 취소한 경우 — error=access_denied
    if (params.get('error')) {
      setError('카카오 로그인이 취소되었습니다.')
      return
    }
    const code = params.get('code')
    if (!code) {
      setError('잘못된 접근입니다. 로그인 화면에서 다시 시도해 주세요.')
      return
    }
    // 인가 요청 때 저장한 state와 대조 — 위조된 리다이렉트를 걸러낸다 (CSRF 방지).
    // **소비를 비교보다 먼저** 한다 (백로그 103번): 종전엔 `!params.get('state') || ...` 단축 평가로
    // state 파라미터가 없으면 consumeKakaoState()가 호출되지 않아 옛 state가 저장소에 남았다
    const savedState = consumeKakaoState()
    if (!params.get('state') || params.get('state') !== savedState) {
      setError('잘못된 접근입니다. 로그인 화면에서 다시 시도해 주세요.')
      return
    }
    // 남아 있는 옛 토큰을 교환 시작 전에 지운다 (백로그 90번 처방 ① — 경쟁의 뿌리 차단).
    // React는 자식 effect를 부모보다 먼저 실행하므로, 이 동기 블록이 AuthProvider의 복원 effect보다
    // 앞서 돈다 — 여기서 지우면 복원이 "토큰 없음"으로 아예 시작되지 않는다.
    // 순서가 어긋나는 다른 경로는 AuthContext의 세대 번호(처방 ②)가 막는다
    clearToken()
    loginWithKakao({ code, redirectUri: KAKAO_REDIRECT_URI })
      .then(() => navigate('/', { replace: true }))
      // AUTH_SOCIAL_EMAIL_CONFLICT(같은 이메일의 자체 가입 계정)·AUTH_SOCIAL_LOGIN_FAILED 등 —
      // 서버 메시지가 이미 한국어 안내라 그대로 보여준다
      .catch((err) => setError(err.message))
  }, [loginWithKakao, navigate])

  return (
    <main className="auth-page">
      <h1>카카오 로그인</h1>
      {!error && <p>로그인 처리 중…</p>}
      {error && <p className="submit-error">{error}</p>}
      {error && (
        <p className="auth-switch">
          <Link to="/login">로그인 화면으로 돌아가기</Link>
        </p>
      )}
    </main>
  )
}
