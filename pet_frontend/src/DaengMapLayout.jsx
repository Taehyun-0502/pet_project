import { NavLink, Outlet } from 'react-router-dom'
import './common/warm.css'
import './daengMap.css'

/**
 * 댕맵 — 지도와 산책을 한 화면에서 탭으로 나눠 보는 레이아웃 (2026-08-26).
 *
 * 전에는 홈 상단 스트립의 칩이 지도·산책을 골랐는데, 하단 앱바의 "댕맵" 하나로 묶고
 * 그 안에서 나누는 구조로 바꿨다(사용자 요청). 마이페이지 탭과 같은 방식이다 —
 * 탭이 곧 URL(/map·/walk)이고 `<Outlet>` 자리만 갈아 끼운다. 새로고침·뒤로가기·공유가
 * 그대로 동작하고, 지도·산책 화면(타 슬라이스 파일)은 손대지 않는다.
 */
const TABS = [
  { to: '/map', label: '지도' },
  { to: '/walk', label: '산책' },
]

export default function DaengMapLayout() {
  return (
    <main className="warm daengmap">
      {/* 화면 제목 — 오픈채팅·마이페이지와 같은 형식 (2026-08-26) */}
      <header className="w-top">
        <h1>댕맵</h1>
      </header>

      <nav className="daengmap-tabs" aria-label="댕맵 메뉴">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      {/* 갈아 끼우는 영역 — 지도 / 산책 */}
      <div className="daengmap-view">
        <Outlet />
      </div>
    </main>
  )
}
