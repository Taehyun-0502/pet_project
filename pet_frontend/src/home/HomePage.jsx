import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import { getMyPets } from '../pet/petApi'
import { getMyRooms } from '../chat/chatApi'
import { categoryLabel } from '../chat/roomCategories'
// 타 슬라이스(shorts) 파일이지만 API 호출만 빌려 쓴다 — 파일 수정 없음 (슬라이스 경계 유지)
import { getShortsFeed } from '../shorts/shortsApi'
import InstallAppButton from '../components/InstallAppButton'
import '../common/modernist.css'
import './home.css'

// 홈 — 기능 타일(화면 안 탭) · AI 질문 · 내 반려동물 프로필 · 오픈채팅 3 · 숏츠 3.
// 기존 "/" = 반려동물 목록 자리를 대체한 화면. 전체 목록은 마이페이지 펫 탭(/mypage/pets)이
// 담당하고(구 /pets 목록 라우트는 2026-08-25 폐지), 여기서는 대표 1마리(칩으로 전환)만 보여준다.
//
// 실연동 완료 (2026-08-25): 오픈채팅 3개(getMyRooms — 참여 방, 서버가 고정·최근 대화순 정렬),
// 숏츠 3개(getShortsFeed limit 3 — 품질점수순 공개 피드).
// 실연동 남은 자리 (TODO 표시):
//  - 산책 타일의 노면 온도: pages/walk/walkApi getWalkWeather(lat, lng) — 위치 훅 필요
// UI에 서버 enum(SAFE|CAUTION|DANGER|SEVERE)을 그대로 노출하지 않는다 — 한국어 라벨만.
const RISK_LABEL = { SAFE: '안전', CAUTION: '주의', DANGER: '위험', SEVERE: '매우 위험' }

const SUGGESTS = ['사료 얼마나 줘야 해?', '근처 야간 병원']

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
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [pets, setPets] = useState(null) // null = 불러오는 중
  const [petIdx, setPetIdx] = useState(0)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  // 로그아웃·앱 설치는 /pets(구 임시 홈)에서 이관 (2026-08-25) — 홈이 유일한 자기 세션 로그아웃 자리다.
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

  const [rooms, setRooms] = useState([]) // 참여 중인 방 — 고정 먼저, 최근 대화순 (서버 정렬)
  const [shorts, setShorts] = useState([]) // 피드 상위 3개 (품질점수순)
  const [walk] = useState(null) // TODO 실연동: 노면 온도 — walkApi.getWalkWeather + 위치 훅

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
    setAsked(true)
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
    <main className="mn home">
      <div className="mn-top">
        {/* 디자인 원본 표기는 "멍냥로그" — 실제 서비스명(index.html title)에 맞춘다 */}
        <div className="mn-brand">댕댕댕</div>
        <div className="home-top-actions">
          <InstallAppButton />
          <button type="button" className="mn-link" onClick={() => navigate('/mypage')}>
            {`${user?.name ?? ''}님`}
          </button>
          <button
            type="button"
            className="mn-link"
            onClick={() => onLogout()}
            disabled={loggingOut}
          >
            로그아웃
          </button>
        </div>
      </div>
      <div className="mn-rule" />

      {logoutError && (
        <p className="submit-error" role="alert" style={{ padding: '10px 18px 0' }}>
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

      {/* 기능 타일 — 상단 탭 대신 화면 안에서 기능으로 들어간다 */}
      <div className="mn-tiles">
        <button type="button" className="mn-tile" onClick={() => navigate('/map')}>
          <b>지도</b>
          <span>주변 장소</span>
        </button>
        <button type="button" className="mn-tile" onClick={() => navigate('/walk')}>
          <b>산책</b>
          <span>
            {walk
              ? `노면 ${Math.round(walk.asphaltTemp)}° · ${RISK_LABEL[walk.riskLevel] ?? ''}`
              : '노면 온도 확인'}
          </span>
        </button>
        <button type="button" className="mn-tile" onClick={() => setSheetOpen(true)}>
          <b>건강검진</b>
          <span>AI 2종</span>
        </button>
        <button type="button" className="mn-tile" onClick={() => navigate('/shorts')}>
          <b>숏츠</b>
          <span>영상 보기</span>
        </button>
        <button type="button" className="mn-tile" onClick={() => navigate('/chat')}>
          <b>오픈채팅</b>
          <span>{rooms.length > 0 ? `${rooms.length}개 참여 중` : '방 둘러보기'}</span>
        </button>
        <button type="button" className="mn-tile" onClick={() => navigate('/mypage')}>
          <b>마이</b>
          <span>내 정보</span>
        </button>
      </div>
      <div className="mn-rule" />

      {/* AI 질문 — 홈에서 바로 적고 /aisearch 로 넘긴다 */}
      <section className="home-ask">
        <div className="home-ask-row">
          <span className="home-ask-badge" aria-hidden="true">
            AI
          </span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAsked(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAsk()
            }}
            placeholder={pet ? `${pet.name}에 대해 무엇이든 물어보세요` : 'AI에게 무엇이든 물어보세요'}
            aria-label="AI에게 질문"
          />
          <button type="button" className="mn-link" onClick={onAsk}>
            질문
          </button>
        </div>
        {asked && (
          <p className="home-ask-answer">검색 화면에서 답을 준비합니다…</p>
        )}
        <div className="home-chips">
          {SUGGESTS.map((s) => (
            <button
              key={s}
              type="button"
              className="mn-chip"
              onClick={() => {
                setQ(s)
                navigate(`/aisearch?q=${encodeURIComponent(s)}`)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>
      <div className="mn-hair" />

      {/* 내 반려동물 프로필 */}
      <section className="home-pet">
        <div className="home-pet-chips">
          {(pets ?? []).map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="mn-chip"
              aria-pressed={i === petIdx}
              onClick={() => setPetIdx(i)}
            >
              {p.name}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="mn-link" onClick={() => navigate('/pets/new')}>
            + 등록
          </button>
        </div>

        {error && <p className="submit-error">{error}</p>}
        {pets === null && !error && <p className="home-pet-meta">불러오는 중…</p>}

        {pets && pets.length === 0 && (
          <>
            <div className="home-pet-photo mn-photo" aria-hidden="true" />
            <div className="home-pet-name-row">
              <div>
                <div className="home-pet-name">첫 반려동물 등록</div>
                <p className="home-pet-meta">
                  등록하면 산책·건강검진 기록이 이 자리에 모입니다.
                </p>
              </div>
              <button type="button" className="mn-primary" onClick={() => navigate('/pets/new')}>
                등록하기
              </button>
            </div>
          </>
        )}

        {pet && (
          <>
            {pet.profileImageUrl ? (
              <img className="home-pet-photo mn-photo" src={pet.profileImageUrl} alt="" />
            ) : (
              <div className="home-pet-photo mn-photo" aria-hidden="true" />
            )}
            <div className="home-pet-name-row">
              {/* 이름·정보 블록이 상세(/pets/:id) 진입 링크 — /pets 목록 행에서 이관 (2026-08-25) */}
              <Link
                className="home-pet-link"
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
              <button type="button" className="mn-primary" onClick={() => setSheetOpen(true)}>
                건강관리
              </button>
            </div>
          </>
        )}
      </section>

      {/* 통계 라인(이번 주 산책·최근 검진·나이)은 제거 (2026-08-25 사용자 결정) —
          앞 둘은 집계 API 미확정 placeholder였고, 나이는 이름 아래 메타로 충분 */}
      <div className="mn-rule" />

      {/* 오픈채팅 3 */}
      <div className="mn-sec-head">
        <h2>오픈채팅</h2>
        <button type="button" className="mn-link" onClick={() => navigate('/chat')}>
          전체 보기
        </button>
      </div>
      {/* getMyRooms — 참여 중인 방이라 join 없이 바로 입장. 방 객체를 state로 넘겨야
          방 화면이 프로필(소개·정원)을 그릴 수 있다 (ChatRoomListPage와 같은 계약) */}
      {rooms.slice(0, 3).map((r) => (
        <button
          key={r.id}
          type="button"
          className="mn-row"
          onClick={() => navigate(`/chat/rooms/${r.id}`, { state: { room: r } })}
        >
          <span>
            <b>{r.name}</b>
            <span className="sub">{r.description || categoryLabel(r.category)}</span>
          </span>
          <span className="meta">
            {r.unreadCount > 0
              ? `안 읽음 ${r.unreadCount > 99 ? '99+' : r.unreadCount}`
              : `${r.participantCount}명`}
          </span>
        </button>
      ))}
      {rooms.length === 0 && (
        <p className="home-pet-meta" style={{ padding: '12px 18px' }}>
          참여 중인 방이 없습니다. 지역·품종 방을 둘러보세요.
        </p>
      )}
      <div className="mn-rule" />

      {/* 숏츠 3 */}
      <div className="mn-sec-head">
        <h2>숏츠</h2>
        <button type="button" className="mn-link" onClick={() => navigate('/shorts')}>
          전체 보기
        </button>
      </div>
      {/* getShortsFeed 상위 3개 — ?v= 공유 링크 형식으로 그 영상부터 재생 (shortsApi.getShort 참고) */}
      {shorts.slice(0, 3).map((v) => (
        <button
          key={v.id}
          type="button"
          className="mn-row short"
          onClick={() => navigate(`/shorts?v=${v.id}`)}
        >
          {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" /> : <span className="thumb mn-photo" />}
          <span>
            <b>{v.caption || '제목 없음'}</b>
            <span className="sub">
              {[v.memberName, v.likeCount != null ? `좋아요 ${v.likeCount}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </button>
      ))}
      {shorts.length === 0 && (
        <p className="home-pet-meta" style={{ padding: '12px 18px 24px' }}>
          아직 새 영상이 없습니다.
        </p>
      )}

      {/* 건강검진 바텀시트 — 구 목록 화면(PetListPage, 폐지됨)의 모달을 시트로 옮긴 것.
          넘기는 state(petName, breed, birthDate)는 진단 화면들과의 계약이라 유지 */}
      {sheetOpen && (
        <div
          className="mn-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="AI 건강검진"
          onClick={() => setSheetOpen(false)}
        >
          <div className="mn-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mn-sheet-head">
              <div className="mn-sheet-title">AI 건강검진</div>
              <button type="button" className="mn-link" onClick={() => setSheetOpen(false)}>
                닫기
              </button>
            </div>
            <p className="mn-sheet-lede">
              {pet ? `${pet.name}의 정보가 자동으로 채워집니다.` : '반려동물을 먼저 등록하면 정보가 자동으로 채워집니다.'}
            </p>
            <div className="mn-sheet-item">
              <b>피부 질환 AI 스크리닝</b>
              <p>환부 사진을 찍어 영역을 지정하면 12종 피부 질환을 분석합니다.</p>
              <button
                type="button"
                className="mn-primary block"
                onClick={() => goHealth('/skin/diagnosis')}
              >
                사진으로 시작
              </button>
            </div>
            <div className="mn-sheet-item">
              <b>바이오센서 스마트 문진</b>
              <p>센서 3종 수치와 증상 메모를 종합해 수의사 제출용 소견서를 만듭니다.</p>
              <button
                type="button"
                className="mn-secondary"
                onClick={() => goHealth('/hybrid/diagnosis')}
              >
                수치 입력으로 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
