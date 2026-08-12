import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import { getMyPets } from './petApi'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
// AI 검색 진입 버튼의 시각(둥근 검색바 모양)을 SearchBar 공용 컴포넌트와 맞추기 위해
// 클래스만 재사용한다(.search-bar) — 컴포넌트 자체는 쓰지 않는다(아래 주석 참고).
// 주의: 이 import와 아래 진입 버튼·지도/AI 검색 링크는 2026-08-11 계열 병합에서
// 유실됐다가 08-12 재복원됨 — 병합 해결 시 diff 확인 필수 (QA F-4)
import '../components/SearchBar.css'
import './pet.css'

// 내 반려동물 목록 — 앱의 홈 화면 (구 HomePage 자리)
export default function PetListPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pets, setPets] = useState(null) // null = 아직 불러오는 중
  const [error, setError] = useState('')

  useEffect(() => {
    getMyPets()
      .then(setPets)
      .catch((err) => setError(err.message))
  }, [])

  // 서버 폐기까지 끝난 뒤 이동한다 — 먼저 나가면 쿠키가 남은 채 화면만 바뀔 수 있다
  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="pet-page">
      <header className="pet-header">
        <h1>내 반려동물</h1>
        <div className="who">
          <span>{user.name}님</span>
          {/* 홈 구조 확정 전까지 로그아웃·회원 정보는 홈에 유지, 진입점만 추가 (roadmap 3번) */}
          <Link to="/mypage">마이페이지</Link>
          <button type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* AI 검색 진입 — 루트(홈)에서는 직접 타이핑하지 않고, 누르거나 포커스하는
          즉시 검색 홈(/aisearch)으로 이동한다(검색 입력은 그 페이지에서 시작).
          실제 SearchBar 컴포넌트 대신 시각만 동일한 버튼으로 구현했다 — <input>을
          포함한 SearchBar를 여기 두면 버튼 성격의 이 진입점과 이중 포커스 대상이
          생겨 접근성상 바람직하지 않다(SearchBar는 수정하지 않음). */}
      <button
        type="button"
        className="pet-search-entry search-bar"
        onClick={() => navigate('/aisearch')}
        aria-label="AI 검색으로 이동"
      >
        <span className="search-bar__ai-toggle" aria-hidden="true">
          AI
        </span>
        <span className="pet-search-entry__placeholder">AI에게 검색해보세요</span>
      </button>

      <nav className="pet-nav">
        <Link className="pet-add" to="/pets/new">
          + 반려동물 등록
        </Link>
        {/* 링크가 늘어나도 "+ 반려동물 등록"은 왼쪽에 고정되도록 묶어서 오른쪽에 배치한다 */}
        <span className="pet-nav-links">
          <Link to="/shorts">숏츠 →</Link>
          <Link to="/chat">오픈채팅 →</Link>
          {/* "AI 검색 →" 링크는 두지 않는다 (2026-08-12 사용자 결정) — 위 검색바 모양
              진입 버튼(.pet-search-entry)이 이미 /aisearch 진입점이라 중복이었음 */}
          <Link to="/map">지도 →</Link>
          {/* 산책 — 아스팔트 온도 안내 + GPS 트래킹 (frontend-agent, 2026-08-12).
              기존 링크와 같은 pet-nav-links 패턴으로 최소 추가 — pet 도메인은
              다른 팀원 소유라 팀 공유 필요(규칙 3). */}
          <Link to="/walk">산책 →</Link>
        </span>
      </nav>

      {error && <p className="submit-error">{error}</p>}
      {pets === null && !error && <p>불러오는 중…</p>}
      {pets && pets.length === 0 && <p>등록된 반려동물이 없습니다. 첫 반려동물을 등록해 보세요.</p>}
      {pets && pets.length > 0 && (
        <ul className="pet-list">
          {pets.map((pet) => (
            <li key={pet.id}>
              {/* 항목 전체를 링크로 — li에 onClick을 걸면 키보드로 접근할 수 없다 */}
              <Link to={`/pets/${pet.id}`}>
                {pet.profileImageUrl ? (
                  <img className="pet-thumb" src={pet.profileImageUrl} alt="" />
                ) : (
                  <span className="pet-thumb pet-thumb-empty" aria-hidden="true">🐶</span>
                )}
                <strong>{pet.name}</strong>
                <span className="muted">{pet.breed ?? '품종 미입력'}</span>
                <span className="muted">{pet.birthDate ?? '생년월일 미입력'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
