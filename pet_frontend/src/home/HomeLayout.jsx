import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import InstallAppButton from '../components/InstallAppButton'
import './home.css'

/**
 * 홈 레이아웃 — 헤더 + 기능 메뉴 스트립을 고정하고, **그 아래만 갈아 끼운다** (2026-08-26).
 *
 * 지도·산책을 별도 페이지로 넘기지 않고 홈 안에서 전환하고 싶다는 요청에 따라 만든 구조로,
 * 마이페이지 탭(내 정보·펫 정보)이 `<Outlet>`으로 아래만 바꾸는 것과 같은 방식이다.
 * URL은 그대로 /map·/walk를 쓴다 — 뒤로가기·새로고침·공유가 깨지지 않는다.
 *
 * 숏츠만 예외로 페이지 이동이다: 풀스크린 세로 영상 화면이라 헤더 아래에 끼워 넣으면
 * 화면 비율이 무너진다(ShortsFeed.css가 #root 제약을 스스로 푸는 이유와 같다).
 */
// 홈 안에서 아래 영역만 바뀌는 뷰들. 숏츠는 하단 앱바로, 오픈채팅·마이페이지도 앱바로 갔다
const VIEWS = [
  { label: '지도', to: '/map' },
  { label: '산책', to: '/walk' },
]

export default function HomeLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // 스트립 스와이프:
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

      {/* 기능 메뉴 스트립 — 하단 앱바에 없는 것만 둔다 (오픈채팅·숏츠·건강검진·마이는 앱바 몫).
          지도·산책은 이 아래 영역만 바뀌므로 선택 상태(aria-pressed)를 표시한다.
          "홈" 칩은 두지 않는다 (2026-08-26) — 앱바의 홈 탭이 같은 자리로 돌아온다 */}
      <div
        className="home-tiles"
        ref={tilesRef}
        onPointerDown={onTilesPointerDown}
        onPointerMove={onTilesPointerMove}
        onPointerUp={onTilesPointerEnd}
        onPointerLeave={onTilesPointerEnd}
        onClickCapture={onTilesClickCapture}
      >
        {VIEWS.map((v) => (
          <button
            key={v.to}
            type="button"
            className="home-tile"
            aria-pressed={pathname.startsWith(v.to)}
            onClick={() => navigate(v.to)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* 갈아 끼우는 영역 — 홈 본문 / 지도 / 산책 */}
      <div className="home-view">
        <Outlet />
      </div>
    </main>
  )
}
