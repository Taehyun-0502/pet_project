// AI 검색 페이지(src/pages/aisearch/AiSearchPage.jsx)의 "최근 검색어" 저장 유틸.
// localStorage만 다루는 SDK·컴포넌트 비의존 순수 함수라 common/에 둔다(§2 규칙).
// 저장 형태: 최신순 문자열 배열, 중복 제거, 최대 MAX_ITEMS개.

const STORAGE_KEY = 'aisearch.recent'
const MAX_ITEMS = 10

/**
 * 저장된 최근 검색어 목록을 최신순으로 반환한다.
 * localStorage 접근 실패(프라이빗 모드 등)나 저장된 값이 배열이 아니면 빈 배열을 반환한다.
 *
 * @returns {string[]}
 */
export function loadRecentSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

/**
 * 검색어를 최근 검색어 목록 맨 앞에 추가한다. 이미 있던 동일 검색어는 제거 후
 * 맨 앞으로 다시 올리고(중복 제거 + 최신순 유지), 목록은 MAX_ITEMS개로 자른다.
 * 빈 문자열(trim 후)은 저장하지 않는다.
 *
 * @param {string} query
 * @returns {string[]} 저장 후의 목록(최신순)
 */
export function saveRecentSearch(query) {
  const trimmed = query.trim()
  if (!trimmed) return loadRecentSearches()

  const next = [trimmed, ...loadRecentSearches().filter((item) => item !== trimmed)].slice(
    0,
    MAX_ITEMS,
  )
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 저장 실패(용량 초과 등)는 조용히 무시 — 최근 검색어는 부가 기능이라 화면 동작을 막지 않는다
  }
  return next
}

/**
 * 특정 검색어 하나만 목록에서 제거한다.
 *
 * @param {string} query
 * @returns {string[]} 삭제 후의 목록(최신순)
 */
export function removeRecentSearch(query) {
  const next = loadRecentSearches().filter((item) => item !== query)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 위와 동일한 이유로 무시
  }
  return next
}

/** 최근 검색어 목록을 전부 비운다. */
export function clearRecentSearches() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 위와 동일한 이유로 무시
  }
}
