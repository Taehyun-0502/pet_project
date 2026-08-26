import { createContext, useCallback, useContext, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import InstallAppButton from './components/InstallAppButton'
import { getMyPets } from './pet/petApi'
import './appShell.css'

/**
 * 앱 셸 — 하단 앱바 + 건강검진 바텀시트를 **여러 화면이 공유**하는 레이아웃 라우트 (2026-08-26).
 *
 * 전에는 앱바가 홈 화면 안에만 있어서 마이페이지·오픈채팅으로 넘어가면 사라졌다(사용자 지적).
 * 라우트 레이아웃으로 올려 자식 화면이 바뀌어도 바가 그대로 남는다.
 *
 * **건강검진 시트도 여기로 올렸다.** 앱바의 건강검진 탭은 라우트 이동이 아니라 시트를 여는데,
 * 시트가 홈에만 있으면 다른 화면에서는 열 수 없기 때문이다. 홈의 "건강관리" 버튼은
 * `useHealthSheet()`로 같은 시트를 연다 — 시트를 두 벌 만들지 않기 위한 컨텍스트다.
 *
 * 앱바를 붙이지 않는 화면(라우트에서 이 레이아웃 밖에 둔다): 채팅방(자체 하단 입력 바),
 * 숏츠(풀스크린), 진단·펫 폼처럼 한 가지 일에 집중하는 화면.
 */
const HealthSheetContext = createContext(() => {})

// 홈의 "건강관리" 버튼처럼 화면 안에서 시트를 열 때 쓴다. 인자로 반려동물을 주면
// 그 정보가 진단 화면에 자동 입력된다(주지 않으면 셸이 첫 번째 반려동물을 불러온다)
export function useHealthSheet() {
  return useContext(HealthSheetContext)
}

// 하단 앱바 = 주요 목적지 5개 (2026-08-26 사용자 결정).
// 댕맵은 지도·산책을 묶은 화면이라 기본 진입은 /map이고, 그 안에서 탭으로 나뉜다.
// 건강검진 탭은 제거했다 — 진단은 홈 프로필의 "건강관리" 버튼이 여는 시트로 들어간다
// (시트 자체는 이 셸에 남아 useHealthSheet()로 어느 화면에서든 열 수 있다).
// 숏츠는 풀스크린이라 이 레이아웃 밖 라우트다 — 탭을 누르면 앱바가 없는 화면으로 나간다
/**
 * 앱 설치 버튼의 문구 — 기기마다 "설치"의 뜻이 다르다 (2026-08-26 사용자 요청).
 *  - 안드로이드: 크롬이 실제 설치 프롬프트를 띄운다 → "앱 설치"
 *  - iOS: 사파리는 프롬프트가 없고 공유 → 홈 화면에 추가가 유일한 경로다 → "홈 추가"
 *  - PC: 설치해도 앱이라기보다 바로가기에 가깝다 → "즐겨찾기"
 *
 * 버튼 자체는 타 슬라이스 컴포넌트(components/InstallAppButton)라 고치지 않는다.
 * 대신 헤더에 CSS 변수로 문구를 내려보내고, appShell.css가 라벨을 그린다.
 * (iPadOS는 UA가 맥으로 오므로 터치 지원 여부로 가려낸다)
 */
function installLabel() {
  if (typeof navigator === 'undefined') return '앱 설치'
  const ua = navigator.userAgent
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) return '홈 추가'
  if (/android/i.test(ua)) return '앱 설치'
  return '즐겨찾기'
}

/**
 * 마이페이지 "내 게시물"에서 연 단일 영상 화면인지 (`/shorts?v={id}&only=1`).
 *
 * 주소는 /shorts지만 **마이페이지의 연장**이다 — 내 게시물 그리드에서 내 영상 하나를 열어
 * 본 것이고, 그 화면의 돌아가기 버튼도 그리드로 돌아간다. 그래서 활성 탭도 숏츠가 아니라
 * 마이페이지여야 한다 (2026-08-26 사용자 요청).
 *
 * 플래그의 뜻과 만드는 곳은 ShortsFeed의 singleRef · MyPagePosts의 링크에 있다.
 */
const isMyPostShort = (pathname, search) =>
  pathname.startsWith('/shorts') && new URLSearchParams(search).get('only') === '1'

// match는 (pathname, search)를 받는다 — 탭 판정에 쿼리까지 봐야 하는 경우가 있다(위 참고)
const TABS = [
  { key: 'home', label: '홈', icon: '🏠', to: '/', match: (p) => p === '/' },
  { key: 'map', label: '댕맵', icon: '🗺️', to: '/map', match: (p) => p.startsWith('/map') || p.startsWith('/walk') },
  { key: 'chat', label: '오픈채팅', icon: '💬', to: '/chat', match: (p) => p.startsWith('/chat') },
  {
    key: 'shorts',
    label: '숏츠',
    icon: '🎬',
    to: '/shorts',
    match: (p, s) => p.startsWith('/shorts') && !isMyPostShort(p, s),
  },
  {
    key: 'my',
    label: '마이페이지',
    icon: '👤',
    to: '/mypage',
    match: (p, s) => p.startsWith('/mypage') || isMyPostShort(p, s),
  },
]

/**
 * @param bar 하단 앱바를 함께 둘지. 건강검진(피부·문진) 화면처럼 한 흐름에 집중하는 곳은
 *            `bar={false}`로 **브랜드 헤더만** 얹는다 (2026-08-26 — 그 화면들에도 "댕댕댕"이
 *            있어야 홈으로 돌아갈 길이 생긴다는 사용자 요청). 진단 화면은 타 슬라이스라
 *            루트가 클래스 없는 인라인 스타일 div인데, 앱바까지 두면 그 안쪽 여백을
 *            바깥에서 손봐야 해서 헤더만 얹는 쪽이 침습이 적다
 */
export default function AppShell({ bar = true }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetPet, setSheetPet] = useState(null) // 진단 화면에 넘길 반려동물 (없으면 빈 폼)
  const showBrand = !bar || pathname === '/'

  const openHealthSheet = useCallback((pet) => {
    setSheetPet(pet ?? null)
    setSheetOpen(true)
    if (pet) return
    // 화면이 반려동물을 넘겨주지 않은 경우(앱바 탭)에만 대표 1마리를 불러와 채운다.
    // 실패해도 시트는 열어 둔다 — 정보 자동 입력만 못 할 뿐 진단은 시작할 수 있다
    getMyPets()
      .then((list) => setSheetPet(list?.[0] ?? null))
      .catch(() => {})
  }, [])

  const goHealth = (path) => {
    setSheetOpen(false)
    if (!sheetPet) return navigate(path)
    // 진단 화면들과의 state 계약 (petName·breed·birthDate) — 화면이 이 값으로 폼을 채운다
    navigate(path, {
      state: { petName: sheetPet.name, breed: sheetPet.breed, birthDate: sheetPet.birthDate },
    })
  }

  return (
    <HealthSheetContext.Provider value={openHealthSheet}>
      {/* 브랜드 헤더 — **홈에서만** 쓴다 (2026-08-26 사용자 결정, 전 화면 고정에서 되돌림).
          다른 화면은 각자 제목 헤더(댕맵·오픈채팅·마이페이지)를 갖고 이동은 하단 앱바가 맡는다.
          예외: 앱바가 없는 화면(진단, bar={false})은 홈으로 돌아갈 길이 이것뿐이라 유지한다 */}
      {showBrand && (
        <header className="app-top" style={{ '--install-label': `'${installLabel()}'` }}>
          <Link className="app-brand" to="/">댕댕댕</Link>
          <InstallAppButton />
        </header>
      )}

      <Outlet />

      {sheetOpen && (
        <div
          className="app-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="AI 건강검진"
          onClick={() => setSheetOpen(false)}
        >
          <div className="app-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="app-sheet-head">
              <div className="app-sheet-title">AI 건강검진</div>
              <button type="button" className="app-link" onClick={() => setSheetOpen(false)}>
                닫기
              </button>
            </div>
            <p className="app-sheet-lede">
              {sheetPet
                ? `${sheetPet.name}의 정보가 자동으로 채워집니다.`
                : '반려동물을 먼저 등록하면 정보가 자동으로 채워집니다.'}
            </p>
            <div className="app-sheet-item">
              <b>피부 질환 AI 스크리닝</b>
              <p>환부 사진을 찍어 영역을 지정하면 12종 피부 질환을 분석합니다.</p>
              <button type="button" className="app-cta" onClick={() => goHealth('/skin/diagnosis')}>
                사진으로 시작
              </button>
            </div>
            <div className="app-sheet-item">
              <b>바이오센서 스마트 문진</b>
              <p>센서 3종 수치와 증상 메모를 종합해 수의사 제출용 소견서를 만듭니다.</p>
              <button type="button" className="app-ghost" onClick={() => goHealth('/hybrid/diagnosis')}>
                수치 입력으로 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {bar && (
      <nav className="appbar" aria-label="주요 메뉴">
        {TABS.map((t) => {
          const active = t.match ? t.match(pathname, search) : false
          return (
            <button
              key={t.key}
              type="button"
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => (t.to ? navigate(t.to) : openHealthSheet())}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </nav>
      )}
    </HealthSheetContext.Provider>
  )
}
