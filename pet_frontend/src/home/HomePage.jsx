import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyPets } from '../pet/petApi'
import { getMyRooms } from '../chat/chatApi'
import { categoryLabel } from '../chat/roomCategories'
// 타 슬라이스(shorts) 파일이지만 API 호출만 빌려 쓴다 — 파일 수정 없음 (슬라이스 경계 유지)
import { getShortsFeed } from '../shorts/shortsApi'
import InstallAppButton from '../components/InstallAppButton'
import './home.css'

// 홈 — 기능 메뉴(상단 스트립) · AI 질문 · 내 반려동물 프로필 · 오픈채팅 3 · 숏츠 3 · 하단 앱바.
// 메뉴 배치 (2026-08-26): 하단 앱바 = 홈·오픈채팅·건강검진·마이페이지,
// 상단 스트립 = 앱바에 없는 나머지(지도·산책·숏츠). 같은 기능을 두 곳에 두지 않는다.
// 웜톤 템플릿 리디자인 (2026-08-25 사용자 제공 시안) — 로그인·가입과 같은 무드로 전환.
// Modernist(.mn) 의존을 끊고 home.css의 .home 스코프만 쓴다. 로직은 리디자인 전과 동일.
//
// 전체 목록은 마이페이지 펫 탭(/mypage/pets)이 담당하고(구 /pets 목록 라우트는 2026-08-25 폐지),
// 여기서는 대표 1마리(칩으로 전환)만 보여준다.
//
// 실연동 완료 (2026-08-25): 오픈채팅 3개(getMyRooms — 참여 방, 서버가 고정·최근 대화순 정렬),
// 숏츠 3개(getShortsFeed limit 3 — 품질점수순 공개 피드).
// 산책 노면 온도는 타일 설명 제거(2026-08-26)로 홈 표시 자리가 없어짐 — 산책 화면(/walk)이 담당.
// AI 추천 질문 칩도 제거(2026-08-26, 한 줄 압축) — 추천·이력은 /aisearch 검색 홈이 담당.

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
  // 로그인 정보(useAuth)는 더 이상 이 화면에서 쓰지 않는다 — 회원명·로그아웃을 마이페이지로 옮겼다.
  // 접근 제어는 RequireLogin 라우트가 이미 하고 있다
  const navigate = useNavigate()

  const [pets, setPets] = useState(null) // null = 불러오는 중
  const [petIdx, setPetIdx] = useState(0)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  // 상단 스트립 스와이프 (2026-08-26):
  //  - 모바일: 터치 스와이프는 스크롤 컨테이너의 네이티브 동작 (별도 코드 불필요)
  //  - PC 휠: 브라우저는 세로 휠을 가로 스크롤로 안 바꿔주므로 직접 변환.
  //    React onWheel은 passive라 preventDefault가 안 먹어서 ref + non-passive 리스너로 단다.
  //  - PC 드래그: 마우스로 잡아 끄는 스와이프. 터치(pointerType !== 'mouse')는 네이티브에
  //    맡겨야 하므로 마우스만 처리하고, 끌었으면 놓을 때 칩 클릭이 오발되지 않게 캡처에서 삼킨다.
  const tilesRef = useRef(null)
  const tilesDrag = useRef({ down: false, moved: false, startX: 0, startLeft: 0 })
  useEffect(() => {
    const el = tilesRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return // 다 보이면 세로 스크롤에 양보
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // 가로 제스처는 브라우저 기본에 맡김
      el.scrollLeft += e.deltaY
      e.preventDefault() // 페이지 세로 스크롤과 동시에 움직이는 것 방지
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onTilesPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return
    tilesDrag.current = {
      down: true, moved: false, startX: e.clientX, startLeft: tilesRef.current.scrollLeft,
    }
  }
  const onTilesPointerMove = (e) => {
    const d = tilesDrag.current
    if (!d.down) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 4) d.moved = true // 4px 이내 흔들림은 클릭으로 취급
    if (d.moved) tilesRef.current.scrollLeft = d.startLeft - dx
  }
  const onTilesPointerEnd = () => { tilesDrag.current.down = false }
  const onTilesClickCapture = (e) => {
    if (!tilesDrag.current.moved) return
    tilesDrag.current.moved = false
    e.preventDefault()
    e.stopPropagation() // 드래그로 끝난 제스처가 칩 클릭(내비게이션)으로 이어지지 않게
  }

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

  const goHealth = (path) => {
    setSheetOpen(false)
    if (!pet) return navigate(path)
    navigate(path, {
      state: { petName: pet.name, breed: pet.breed, birthDate: pet.birthDate },
    })
  }

  return (
    <main className="home">
      {/* 헤더는 브랜드 + 앱 설치만 (2026-08-26) — 회원명은 하단 앱바의 마이페이지가,
          로그아웃은 마이페이지 내 정보가 맡는다 */}
      <header className="home-top">
        <span className="home-brand">댕댕댕</span>
        <div className="home-top-actions">
          <InstallAppButton />
        </div>
      </header>

      {/* 기능 메뉴 스트립 — 하단 앱바에 없는 것만 둔다 (건강검진·오픈채팅·마이는 앱바 몫) */}
      <div
        className="home-tiles"
        ref={tilesRef}
        onPointerDown={onTilesPointerDown}
        onPointerMove={onTilesPointerMove}
        onPointerUp={onTilesPointerEnd}
        onPointerLeave={onTilesPointerEnd}
        onClickCapture={onTilesClickCapture}
      >
        <button type="button" className="home-tile" onClick={() => navigate('/map')}>지도</button>
        <button type="button" className="home-tile" onClick={() => navigate('/walk')}>산책</button>
        <button type="button" className="home-tile" onClick={() => navigate('/shorts')}>숏츠</button>
      </div>

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

      {/* 내 반려동물 프로필 — 시안의 사진+이름·메타+건강관리 가로 배치 */}
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
            <button type="button" className="home-cta" onClick={() => setSheetOpen(true)}>
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

      {/* 건강검진 바텀시트 — 넘기는 state(petName, breed, birthDate)는 진단 화면들과의 계약이라 유지 */}
      {sheetOpen && (
        <div
          className="home-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="AI 건강검진"
          onClick={() => setSheetOpen(false)}
        >
          <div className="home-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="home-sheet-head">
              <div className="home-sheet-title">AI 건강검진</div>
              <button type="button" className="home-link" onClick={() => setSheetOpen(false)}>
                닫기
              </button>
            </div>
            <p className="home-sheet-lede">
              {pet ? `${pet.name}의 정보가 자동으로 채워집니다.` : '반려동물을 먼저 등록하면 정보가 자동으로 채워집니다.'}
            </p>
            <div className="home-sheet-item">
              <b>피부 질환 AI 스크리닝</b>
              <p>환부 사진을 찍어 영역을 지정하면 12종 피부 질환을 분석합니다.</p>
              <button
                type="button"
                className="home-cta block"
                onClick={() => goHealth('/skin/diagnosis')}
              >
                사진으로 시작
              </button>
            </div>
            <div className="home-sheet-item">
              <b>바이오센서 스마트 문진</b>
              <p>센서 3종 수치와 증상 메모를 종합해 수의사 제출용 소견서를 만듭니다.</p>
              <button
                type="button"
                className="home-ghost"
                onClick={() => goHealth('/hybrid/diagnosis')}
              >
                수치 입력으로 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 앱바 (2026-08-26 사용자 결정) — 상단 기능 메뉴를 대체한다.
          홈 화면 전용이다: 건강검진이 라우트가 아니라 이 화면의 바텀시트라 여기서만 성립하고,
          지도·숏츠·채팅방은 자체 하단 UI(바텀시트·입력 바)가 있어 공통 앱바와 충돌한다.
          전 화면 공통으로 올리려면 App.jsx 레이아웃과 각 화면 하단 여백을 함께 손봐야 한다 */}
      <nav className="home-tabbar" aria-label="주요 메뉴">
        <button type="button" className="active" aria-current="page">
          <span aria-hidden="true">🏠</span>홈
        </button>
        <button type="button" onClick={() => navigate('/chat')}>
          <span aria-hidden="true">💬</span>오픈채팅
        </button>
        <button type="button" onClick={() => setSheetOpen(true)}>
          <span aria-hidden="true">🩺</span>건강검진
        </button>
        <button type="button" onClick={() => navigate('/mypage')}>
          <span aria-hidden="true">👤</span>마이페이지
        </button>
      </nav>
    </main>
  )
}
