import { createContext, useCallback, useContext, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
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
// 건강검진만 라우트 이동이 아니라 이 셸의 바텀시트를 연다 — 진단 2종 중 고르는 화면이라
// 목적지가 하나로 정해지지 않기 때문이고, 셸에 있으니 어느 화면에서 눌러도 열린다.
// 숏츠는 풀스크린이라 이 레이아웃 밖 라우트다 — 탭을 누르면 앱바가 없는 화면으로 나간다
const TABS = [
  { key: 'home', label: '홈', icon: '🏠', to: '/', match: (p) => p === '/' || p.startsWith('/map') || p.startsWith('/walk') },
  { key: 'chat', label: '오픈채팅', icon: '💬', to: '/chat', match: (p) => p.startsWith('/chat') },
  { key: 'shorts', label: '숏츠', icon: '🎬', to: '/shorts', match: (p) => p.startsWith('/shorts') },
  { key: 'health', label: '건강검진', icon: '🩺' }, // 이동이 아니라 시트를 연다
  { key: 'my', label: '마이페이지', icon: '👤', to: '/mypage', match: (p) => p.startsWith('/mypage') },
]

export default function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetPet, setSheetPet] = useState(null) // 진단 화면에 넘길 반려동물 (없으면 빈 폼)

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

      <nav className="appbar" aria-label="주요 메뉴">
        {TABS.map((t) => {
          const active = t.match ? t.match(pathname) : false
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
    </HealthSheetContext.Provider>
  )
}
