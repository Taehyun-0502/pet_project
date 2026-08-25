import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'

// 가입 수단 표시 문구 — 서버 provider 값(api-spec.md 1절 4차)의 화면 이름
const PROVIDER_LABEL = { LOCAL: '이메일', KAKAO: '카카오' }

/**
 * 마이페이지 — 내 정보 탭. **읽기 전용 요약 + 하위 화면 진입점**이다 (2026-08-13 개편).
 *
 * 수정 기능(사진·이름)은 MyPageEdit로 옮겼다. 이 화면이 "지금 내 계정이 어떤 상태인가"만
 * 보여주고, 바꾸는 일은 목적 화면으로 들어가서 하는 구조다 (MyPage.jsx 주석 참조).
 */
export default function MyPageProfile() {
  const { user } = useAuth()

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
        <Link to="/mypage/edit">정보 수정</Link>
        <Link to="/mypage/security">보안</Link>
      </div>
    </section>
  )
}
