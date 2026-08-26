import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHealthSheet } from '../AppShell'
import { getMyPets } from '../pet/petApi'
import { getMyRooms } from '../chat/chatApi'
import { categoryLabel } from '../chat/roomCategories'
// 타 슬라이스(shorts) 파일이지만 API 호출만 빌려 쓴다 — 파일 수정 없음 (슬라이스 경계 유지)
import { getShortsFeed } from '../shorts/shortsApi'
// 광고 배너도 타 슬라이스(ad) 컴포넌트다 — 꽂아 쓰기만 하고 파일은 고치지 않는다.
// 홈 안에서의 모양(테두리·라운드·여백)만 home.css에서 덮어쓴다
import AdBanner from '../ad/AdBanner'
import './home.css'

// 홈 — AI 질문 · 내 반려동물 프로필 · 오픈채팅 3 · 광고 · 숏츠 3.
//
// 브랜드 헤더·하단 앱바·건강검진 시트는 AppShell이 맡는다 (2026-08-26).
// 지도·산책은 홈 상단 스트립에서 하단 앱바의 "댕맵"(DaengMapLayout)으로 옮겼다.
//
// 전체 반려동물 목록은 마이페이지 펫 탭(/mypage/pets)이 담당하고(구 /pets 목록 라우트는
// 2026-08-25 폐지), 여기서는 대표 1마리(칩으로 전환)만 보여준다.
//
// 실연동 완료 (2026-08-25): 오픈채팅 3개(getMyRooms — 참여 방, 서버가 고정·최근 대화순 정렬),
// 숏츠 3개(getShortsFeed limit 3 — 품질점수순 공개 피드).

function ageFromBirth(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const before =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  if (before) age -= 1
  return age < 0 ? null : age
}

export default function HomePage() {
  const navigate = useNavigate()
  const openHealthSheet = useHealthSheet() // 셸이 들고 있는 건강검진 시트 (앱바 탭과 같은 시트)

  const [pets, setPets] = useState(null) // null = 불러오는 중
  const [petIdx, setPetIdx] = useState(0)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [rooms, setRooms] = useState([]) // 참여 중인 방 — 고정 먼저, 최근 대화순 (서버 정렬)
  const [shorts, setShorts] = useState([]) // 피드 상위 3개 (품질점수순)

  useEffect(() => {
    let cancelled = false
    getMyPets()
      .then((list) => { if (!cancelled) setPets(list) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    // 오픈채팅·숏츠는 보조 섹션 — 실패해도 홈을 막지 않고 빈 상태 문구로 둔다
    getMyRooms()
      .then((list) => { if (!cancelled) setRooms(list) })
      .catch(() => {})
    getShortsFeed({ limit: 3 })
      .then((feed) => { if (!cancelled) setShorts(feed.items) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const pet = pets && pets.length > 0 ? pets[Math.min(petIdx, pets.length - 1)] : null
  const age = pet ? ageFromBirth(pet.birthDate) : null

  const onAsk = () => {
    const query = q.trim()
    if (!query) return
    // 답은 검색 화면에서 만든다 — 홈은 질문을 넘기기만 한다
    navigate(`/aisearch?q=${encodeURIComponent(query)}`)
  }

  return (
    <main className="home">
      {/* AI 질문 — 한 줄 필. 홈에서 바로 적고 /aisearch 로 넘긴다 */}
      <section className="home-ask">
        <span className="home-ask-badge" aria-hidden="true">AI</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAsk()
          }}
          placeholder={pet ? `${pet.name}에 대해 무엇이든 물어보세요` : 'AI에게 무엇이든 물어보세요'}
          aria-label="AI에게 질문"
        />
        <button type="button" className="home-link" onClick={onAsk}>
          질문
        </button>
      </section>

      {/* 내 반려동물 프로필 — 사진 + 이름·메타 + 건강관리/산책 */}
      <section className="home-card home-pet">
        <div className="home-pet-chips">
          {(pets ?? []).map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="home-chip"
              aria-pressed={i === petIdx}
              onClick={() => setPetIdx(i)}
            >
              {p.name}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="home-link" onClick={() => navigate('/pets/new')}>
            + 등록
          </button>
        </div>

        {error && <p className="submit-error">{error}</p>}
        {pets === null && !error && <p className="home-muted">불러오는 중…</p>}

        {pets && pets.length === 0 && (
          <div className="home-pet-row">
            <div className="home-pet-photo home-pet-photo-empty" aria-hidden="true">🐶</div>
            <div className="home-pet-info">
              <div className="home-pet-name">첫 반려동물 등록</div>
              <p className="home-pet-meta">등록하면 산책·건강검진 기록이 이 자리에 모입니다.</p>
            </div>
            <button type="button" className="home-cta" onClick={() => navigate('/pets/new')}>
              등록하기
            </button>
          </div>
        )}

        {pet && (
          <div className="home-pet-row">
            {pet.profileImageUrl ? (
              <img className="home-pet-photo" src={pet.profileImageUrl} alt="" />
            ) : (
              <div className="home-pet-photo home-pet-photo-empty" aria-hidden="true">🐶</div>
            )}
            {/* 이름·정보 블록이 상세(/pets/:id) 진입 링크 — /pets 목록 행에서 이관 (2026-08-25) */}
            <Link
              className="home-pet-info"
              to={`/pets/${pet.id}`}
              aria-label={`${pet.name} 상세 정보`}
            >
              <div className="home-pet-name">{pet.name}</div>
              <p className="home-pet-meta">
                {[pet.breed ?? '품종 미입력', age !== null ? `${age}살` : null, pet.birthDate]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Link>
            {/* 산책 버튼은 뺐다 (2026-08-26) — 산책은 하단 앱바의 댕맵 안 탭이 담당한다.
                선택된 반려동물을 넘겨 진단 화면 입력이 이 아이 기준으로 채워지게 한다 */}
            <button type="button" className="home-cta" onClick={() => openHealthSheet(pet)}>
              건강관리
            </button>
          </div>
        )}
      </section>

      {/* 오픈채팅 3 — getMyRooms. 참여 중인 방이라 join 없이 바로 입장하고,
          방 객체를 state로 넘겨야 방 화면이 프로필(소개·정원)을 그릴 수 있다 (ChatRoomListPage와 같은 계약) */}
      <section className="home-card home-list">
        <div className="home-card-head">
          <h2><span aria-hidden="true">💬</span> 오픈채팅</h2>
          <button type="button" className="home-link" onClick={() => navigate('/chat')}>
            전체 보기
          </button>
        </div>
        {rooms.slice(0, 3).map((r) => (
          <button
            key={r.id}
            type="button"
            className="home-lrow"
            onClick={() => navigate(`/chat/rooms/${r.id}`, { state: { room: r } })}
          >
            <span className="home-lrow-main">
              <b>{r.name}</b>
              <span className="sub">{r.description || categoryLabel(r.category)}</span>
            </span>
            <span className="home-lrow-meta">
              {r.unreadCount > 0
                ? `안 읽음 ${r.unreadCount > 99 ? '99+' : r.unreadCount}`
                : `${r.participantCount}명`}
            </span>
            <span className="home-lrow-chev" aria-hidden="true">›</span>
          </button>
        ))}
        {rooms.length === 0 && (
          <p className="home-muted">참여 중인 방이 없습니다. 지역·품종 방을 둘러보세요.</p>
        )}
      </section>

      {/* 광고 — 오픈채팅과 숏츠 사이 (2026-08-26). 계약 광고가 없거나 조회에 실패하면
          AdBanner가 스스로 null을 반환해 자리도 차지하지 않는다 (부가 요소 원칙) */}
      <AdBanner />

      {/* 숏츠 3 — ?v= 공유 링크 형식으로 그 영상부터 재생 (shortsApi.getShort 참고) */}
      <section className="home-card home-list">
        <div className="home-card-head">
          <h2><span aria-hidden="true">🎬</span> 숏츠</h2>
          <button type="button" className="home-link" onClick={() => navigate('/shorts')}>
            전체 보기
          </button>
        </div>
        {shorts.slice(0, 3).map((v) => (
          <button
            key={v.id}
            type="button"
            className="home-lrow short"
            onClick={() => navigate(`/shorts?v=${v.id}`)}
          >
            {v.thumbnailUrl ? (
              <img className="home-lrow-thumb" src={v.thumbnailUrl} alt="" />
            ) : (
              <span className="home-lrow-thumb home-lrow-thumb-empty" aria-hidden="true">▶</span>
            )}
            <span className="home-lrow-main">
              <b>{v.caption || '제목 없음'}</b>
              <span className="sub">
                {[v.memberName, v.likeCount != null ? `좋아요 ${v.likeCount}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="home-lrow-chev" aria-hidden="true">›</span>
          </button>
        ))}
        {shorts.length === 0 && <p className="home-muted">아직 새 영상이 없습니다.</p>}
      </section>
    </main>
  )
}
