import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getAds } from './adApi'
import './AdBanner.css'

/**
 * 광고 배너 (광고배너_구현가이드.md 3절).
 *
 * 노출 위치가 아직 정해지지 않아 **어디에나 꽂을 수 있는 형태**로 만들었다 —
 * 자리를 차지하는 일반 요소라서 놓는 곳이 곧 배너 위치가 된다. 가이드가 예시로 든
 * 하단 고정(position:fixed)은 위치가 확정되면 CSS만 바꾸면 된다.
 *
 * @param placement 노출 위치 태그. 넘기지 않으면 위치를 가리지 않고 전부 후보가 된다
 */
export default function AdBanner({ placement }) {
  const [ads, setAds] = useState([]) // 노출 가능한 광고 전부 (1회 로드)
  const [current, setCurrent] = useState(null) // 그중 지금 보여줄 하나
  const { pathname } = useLocation()

  // 목록은 화면당 한 번만 받는다. 페이지를 옮길 때마다 다시 받을 이유가 없다 —
  // 계약 기간은 분 단위로 바뀌지 않으므로 그 사이 목록이 달라질 일이 사실상 없다
  useEffect(() => {
    getAds(placement)
      .then(setAds)
      // 광고는 부가 요소다. 실패해도 화면에 오류를 띄우지 않고 배너만 조용히 빠진다 —
      // 광고를 못 불러온 것 때문에 반려동물 목록 화면이 오류처럼 보여서는 안 된다
      .catch(() => setAds([]))
  }, [placement])

  /*
   * 새로고침(마운트)과 페이지 이동마다 다시 고른다.
   *
   * pathname을 의존성에 둔 이유: 지금은 이 배너가 화면과 함께 사라졌다 다시 생기지만,
   * 나중에 하단 고정처럼 페이지 이동 중에도 살아 있는 자리로 옮기면 마운트가 일어나지 않아
   * 같은 광고가 계속 붙어 있게 된다. 그때도 서버 재호출 없이 광고만 바뀐다
   */
  useEffect(() => {
    setCurrent(ads.length === 0 ? null : ads[Math.floor(Math.random() * ads.length)])
  }, [ads, pathname])

  // 계약이 없거나 전부 기간이 끝났으면 자리도 차지하지 않는다
  if (!current) return null

  return (
    <a
      className="ad-banner"
      href={current.linkUrl}
      target="_blank"
      // sponsored — 유료 광고 링크임을 검색엔진에 알리는 표준 값 (가이드 참고 메모)
      rel="noopener noreferrer sponsored"
    >
      <img
        src={current.imageUrl}
        alt={current.title}
        loading="lazy"
        // 이미지 주소가 깨졌으면 배너를 통째로 내린다 — 깨진 이미지 아이콘만 남으면
        // 광고가 아니라 화면이 고장 난 것처럼 보인다
        onError={() => setCurrent(null)}
      />
      {/* 광고임을 알리는 표시 (표시광고법 권장) */}
      <span className="ad-badge">AD</span>
    </a>
  )
}
