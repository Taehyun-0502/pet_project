// AI 검색 페이지 — 루트 CLAUDE.md "Phase: 검색 통합 — AI 챗봇 검색" 구현.
// `?q=` 쿼리 파라미터로 두 상태를 표현한다(같은 라우트 /aisearch 안에서 분기):
// - q 없음  → "검색 홈": 검색바 + 최근 검색어 + 인기 검색어(목 데이터) + 광고 영역
// - q 있음  → "결과 뷰": q로 POST /api/ai-search(askChat) 1회 자동 실행 후
//             AI 답변 텍스트 + 장소 결과 리스트를 보여준다
//
// 지도는 이 페이지에 넣지 않는다(리스트 중심 — 기획 확정). 위치 권한도 요청하지
// 않는다 — askChat 호출 시 lat/lng를 생략해 백엔드가 메시지의 지역명으로 폴백 처리한다.
//
// 검색 실행부는 MapPage.jsx의 두 패턴을 그대로 따른다:
// ① 요청 ID 가드(nearbyRequestIdRef류) — 응답 순서가 뒤바뀌어도 최신 q의 결과만 반영
// ② lastQueryRef로 "같은 q에 대한 중복 실행" 자체를 막는다(Strict Mode 이중 effect 등)

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchBar from '../../components/SearchBar'
import { CATEGORY_META } from '../../components/categoryMeta'
import {
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
} from '../../common/recentSearches'
import { askChat } from '../map/mapApi'
// 장소 리스트는 지도 목록 시트(MapPage)의 기존 아이템 UI를 그대로 재사용한다
// (.map-page__place-list 등) — 같은 시각 언어를 새로 베끼지 않고 클래스를 공유한다.
import '../map/MapPage.css'
import './AiSearchPage.css'

// 서버 집계(인기 검색어) API가 아직 없어 화면 자리만 채우는 목 데이터.
// 실제 API가 생기면 이 배열을 fetch 결과로 교체한다.
const POPULAR_SEARCHES_MOCK = [
  '24시 동물병원',
  '애견동반 카페',
  '강아지 영양제',
  '반려동물 미용실',
  '강아지 산책 코스',
]

function AiSearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q')?.trim() || ''

  const [recent, setRecent] = useState(() => loadRecentSearches())
  const [answer, setAnswer] = useState(null)
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const searchBarWrapRef = useRef(null)
  const requestIdRef = useRef(0)
  const lastQueryRef = useRef(null)

  // 검색 홈으로 진입(또는 복귀)할 때 입력에 자동 포커스.
  // SearchBar는 별도 autoFocus prop이 없어(공용 컴포넌트 수정 없이) 감싼 wrapper에서
  // 실제 입력 엘리먼트를 찾아 focus한다 — 클래스명(search-bar__input)은 컴포넌트 공개 구조.
  useEffect(() => {
    if (q) return
    searchBarWrapRef.current?.querySelector('.search-bar__input')?.focus()
  }, [q])

  // 검색 홈으로 돌아올 때마다 최근 검색어 목록을 최신 상태로 갱신
  useEffect(() => {
    if (!q) setRecent(loadRecentSearches())
  }, [q])

  // q가 있을 때만 자동 실행. 같은 q로는 다시 실행하지 않는다(중복 실행 방지).
  useEffect(() => {
    if (!q) return
    if (lastQueryRef.current === q) return
    lastQueryRef.current = q

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setAnswer(null)
    setPlaces([])

    setRecent(saveRecentSearch(q))

    askChat({ message: q })
      .then((data) => {
        if (requestIdRef.current !== requestId) return // 더 최신 요청이 시작됨 — 폐기
        setAnswer(data.message ?? '')
        setPlaces(data.places ?? [])
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setError('검색 중 문제가 발생했습니다. 다시 시도해주세요.')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [q])

  const goToQuery = (query) => {
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/aisearch?q=${encodeURIComponent(trimmed)}`)
  }

  const handleRemoveRecent = (event, query) => {
    event.stopPropagation() // 항목 클릭(검색 이동)으로 전파되지 않게
    setRecent(removeRecentSearch(query))
  }

  const handleClearRecent = () => {
    clearRecentSearches()
    setRecent([])
  }

  return (
    <main className="aisearch-page">
      <h1 className="aisearch-page__title">AI 검색</h1>

      <div className="aisearch-page__search-bar" ref={searchBarWrapRef}>
        <SearchBar
          placeholder="궁금한 것을 검색해보세요 (예: 근처 24시 동물병원)"
          aiEnabled={true}
          // 이 페이지는 AI 검색 전용 화면 — MapPage와 동일하게 토글을 controlled로 항상 켜둔다
          onAiToggle={() => {}}
          onAiSearch={goToQuery}
        />
      </div>

      {!q && (
        <div className="aisearch-page__home">
          <section className="aisearch-page__section">
            <div className="aisearch-page__section-header">
              <h2>최근 검색어</h2>
              {recent.length > 0 && (
                <button
                  type="button"
                  className="aisearch-page__clear-btn"
                  onClick={handleClearRecent}
                >
                  전체 삭제
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="aisearch-page__empty">최근 검색어가 없습니다.</p>
            ) : (
              <ul className="aisearch-page__chip-list">
                {recent.map((query) => (
                  <li key={query} className="aisearch-page__chip">
                    <button
                      type="button"
                      className="aisearch-page__chip-label"
                      onClick={() => goToQuery(query)}
                    >
                      {query}
                    </button>
                    <button
                      type="button"
                      className="aisearch-page__chip-remove"
                      onClick={(event) => handleRemoveRecent(event, query)}
                      aria-label={`${query} 최근 검색어 삭제`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="aisearch-page__section">
            <h2>인기 검색어</h2>
            <ul className="aisearch-page__chip-list">
              {POPULAR_SEARCHES_MOCK.map((query) => (
                <li key={query} className="aisearch-page__chip aisearch-page__chip--popular">
                  <button
                    type="button"
                    className="aisearch-page__chip-label"
                    onClick={() => goToQuery(query)}
                  >
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="aisearch-page__ad" aria-hidden="true">
            <span className="aisearch-page__ad-label">광고</span>
          </div>
        </div>
      )}

      {q && (
        <div className="aisearch-page__result">
          <p className="aisearch-page__current-query">
            <strong>“{q}”</strong> 검색 결과
          </p>

          {loading && <p className="aisearch-page__status">AI가 답변을 준비하고 있어요…</p>}
          {!loading && error && <p className="aisearch-page__status aisearch-page__status--error">{error}</p>}

          {!loading && !error && (
            <>
              <section className="aisearch-page__section">
                <h2>AI 답변</h2>
                <p className="aisearch-page__answer-text">{answer}</p>
              </section>

              <section className="aisearch-page__section">
                <h2>장소 결과 {places.length > 0 ? `(${places.length})` : ''}</h2>
                {places.length === 0 ? (
                  <p className="aisearch-page__empty">조건에 맞는 장소가 없습니다.</p>
                ) : (
                  <ul className="map-page__place-list">
                    {places.map((place, index) => {
                      const meta = CATEGORY_META[place.category]
                      return (
                        <li
                          key={`${place.name}-${place.lat}-${place.lng}-${index}`}
                          className="map-page__place-item"
                        >
                          {meta && (
                            <span
                              className="map-page__place-dot"
                              style={{ background: meta.color }}
                              aria-hidden="true"
                            />
                          )}
                          <div className="map-page__place-body">
                            <span className="map-page__place-name">{place.name}</span>
                            {place.address && (
                              <span className="map-page__place-address">{place.address}</span>
                            )}
                            {place.phone && (
                              <span className="map-page__place-info">{place.phone}</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </main>
  )
}

export default AiSearchPage
