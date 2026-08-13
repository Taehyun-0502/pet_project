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
  const [selectedPetForHealth, setSelectedPetForHealth] = useState(null) // 건강관리 선택 반려견 상태

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
            <li key={pet.id} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '10px' }}>
                <Link to={`/pets/${pet.id}`} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                  {pet.profileImageUrl ? (
                    <img className="pet-thumb" src={pet.profileImageUrl} alt="" />
                  ) : (
                    <span className="pet-thumb pet-thumb-empty" aria-hidden="true">🐶</span>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong>{pet.name}</strong>
                    <span className="muted" style={{ fontSize: '13px' }}>{pet.breed ?? '품종 미입력'}</span>
                    <span className="muted" style={{ fontSize: '12px' }}>{pet.birthDate ?? '생년월일 미입력'}</span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedPetForHealth(pet)
                  }}
                  style={healthButtonStyle}
                >
                  🏥 건강관리
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 🏥 반려동물 건강관리 & AI 진단 선택 모달 */}
      {selectedPetForHealth && (
        <div style={modalOverlayStyle} onClick={() => setSelectedPetForHealth(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ fontSize: '17px', fontWeight: '800', margin: 0, color: '#0F172A' }}>
                🩺 {selectedPetForHealth.name} AI 건강관리 & 검진
              </h2>
              <button
                type="button"
                onClick={() => setSelectedPetForHealth(null)}
                style={modalCloseButtonStyle}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 16px 0' }}>
              원하시는 AI 건강검진 항목을 선택하세요. 반려견 정보가 자동 채워집니다.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 1. 피부 질환 AI 스크리닝 카드 */}
              <div style={diagnosisChoiceCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>📸</span>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#4F46E5', margin: 0 }}>
                    피부 질환 AI 스크리닝
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  환부 사진을 찍어 드래그 크롭 영역을 지정하면 1차 정상 스크리닝 및 12종 세부 피부 질환을 AI가 정밀 분석합니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const pet = selectedPetForHealth
                    setSelectedPetForHealth(null)
                    navigate('/skin/diagnosis', {
                      state: { petName: pet.name, breed: pet.breed, birthDate: pet.birthDate },
                    })
                  }}
                  style={skinActionButtonStyle}
                >
                  📸 피부 AI 스크리닝 시작하기 →
                </button>
              </div>

              {/* 2. 바이오센서 스마트 문진 카드 */}
              <div style={diagnosisChoiceCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🧪</span>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#059669', margin: 0 }}>
                    바이오센서 스마트 문진
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  CRP·IgG·IL-6 바이오센서 3종 수치와 보호자 증상 메모를 종합 분석하여 ABN/NOR 판정 및 수의사 제출용 PDF 소견서를 발급합니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const pet = selectedPetForHealth
                    setSelectedPetForHealth(null)
                    navigate('/hybrid/diagnosis', {
                      state: { petName: pet.name, breed: pet.breed, birthDate: pet.birthDate },
                    })
                  }}
                  style={hybridActionButtonStyle}
                >
                  🧪 바이오센서 스마트 문진 시작하기 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const healthButtonStyle = {
  padding: '6px 12px',
  backgroundColor: '#EEF2FF',
  color: '#4F46E5',
  border: '1px solid #C7D2FE',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 2px rgba(79, 70, 229, 0.1)',
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
}

const modalContentStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  padding: '20px',
  maxWidth: '440px',
  width: '100%',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  boxSizing: 'border-box',
}

const modalHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const modalCloseButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  color: '#64748B',
  cursor: 'pointer',
  padding: '4px',
}

const diagnosisChoiceCardStyle = {
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '14px',
  backgroundColor: '#F8FAFC',
}

const skinActionButtonStyle = {
  width: '100%',
  padding: '10px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
}

const hybridActionButtonStyle = {
  width: '100%',
  padding: '10px',
  backgroundColor: '#059669',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
}
