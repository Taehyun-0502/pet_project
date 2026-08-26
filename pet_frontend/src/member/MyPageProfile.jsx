import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

// 가입 수단 표시 문구 — 서버 provider 값(api-spec.md 1절 4차)의 화면 이름
const PROVIDER_LABEL = { LOCAL: '이메일', KAKAO: '카카오' }

/**
 * 마이페이지 — 내 정보 탭. **읽기 전용 요약 + 하위 화면 진입점**이다 (2026-08-13 개편).
 *
 * 수정 기능(사진·이름)은 MyPageEdit로 옮겼다. 이 화면이 "지금 내 계정이 어떤 상태인가"만
 * 보여주고, 바꾸는 일은 목적 화면으로 들어가서 하는 구조다 (MyPage.jsx 주석 참조).
 *
 * 로그아웃은 홈 헤더에서 이관했다 (2026-08-26) — 헤더를 브랜드만 남기고 비우면서,
 * 계정 관련 동작이 모이는 이 화면으로 옮겼다. **앱 전체에서 유일한 자기 세션 로그아웃**이라
 * 지우면 로그아웃할 방법이 사라진다 (기기 목록의 원격 로그아웃은 *다른* 기기용이고,
 * 서버도 현재 세션은 400으로 거부한다 — MyPageSecurity 참조).
 */
export default function MyPageProfile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  // 서버 폐기까지 끝난 뒤 이동한다 — 먼저 나가면 쿠키가 남은 채 화면만 바뀔 수 있다.
  // 실패는 삼키지 않고 노출한다 (백로그 44번) — 재시도와 "이 기기에서만"(forceLocal) 중 선택
  const onLogout = async (forceLocal = false) => {
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout({ forceLocal })
      navigate('/login', { replace: true })
    } catch {
      setLogoutError(
        '로그아웃하지 못했습니다. 서버에 연결할 수 없어 이 브라우저의 로그인 상태가 아직 살아 있습니다.',
      )
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <section className="my-info">
      <h2>내 정보</h2>
      <div className="profile-photo">
        {user.profileImageUrl ? (
          <img src={user.profileImageUrl} alt="내 프로필 사진" />
        ) : (
          <div className="profile-photo-placeholder" aria-hidden="true">👤</div>
        )}
      </div>
      <dl>
        <div>
          <dt>이름</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt>이메일</dt>
          {/* 소셜 계정은 이메일 미동의 시 null (api-spec.md 1절 4차) */}
          <dd>{user.email ?? '미제공 (카카오 계정)'}</dd>
        </div>
        <div>
          <dt>가입 수단</dt>
          {/* 모르는 값이 와도 화면이 비지 않게 원문을 그대로 보여준다 */}
          <dd>{PROVIDER_LABEL[user.provider] ?? user.provider}</dd>
        </div>
      </dl>
      <div className="mypage-actions">
        {/* 링크지만 고스트 버튼 모양(w-ghost) — 코럴 채움(w-cta)은 화면 최상위 액션에만 쓴다 */}
        <Link className="w-ghost" to="/mypage/edit">정보 수정</Link>
        <Link className="w-ghost" to="/mypage/security">보안</Link>
      </div>

      {logoutError && (
        <p className="submit-error mypage-logout-error" role="alert">
          {logoutError}{' '}
          <button type="button" onClick={() => onLogout()} disabled={loggingOut}>
            다시 시도
          </button>{' '}
          {/* 서버가 오래 죽어 있을 때의 탈출구 — 서버 세션은 남을 수 있음을 위 문구로 안내한 상태 */}
          <button type="button" onClick={() => onLogout(true)} disabled={loggingOut}>
            이 기기에서만 로그아웃
          </button>
        </p>
      )}
      <button
        type="button"
        className="w-ghost block mypage-logout"
        onClick={() => onLogout()}
        disabled={loggingOut}
      >
        {loggingOut ? '로그아웃 중…' : '로그아웃'}
      </button>
    </section>
  )
}
