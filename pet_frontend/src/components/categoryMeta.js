// 장소 카테고리 메타 (마커 색·라벨) — PetMap(마커·토글·상세 시트)과 MapPage(장소 목록
// 시트)가 공유한다. PetMap.jsx에서 분리한 이유(2026-08-07): 컴포넌트 파일의 named
// export는 Vite fast-refresh를 깨뜨린다는 lint 경고(react/only-export-components) 해소.
// design-agent가 카테고리 색 토큰(루트 CLAUDE.md 디자인 항목)을 확정하면 이 객체
// 하나만 바꾸면 마커·칩·목록 배지가 함께 바뀐다.
export const CATEGORY_META = {
  HOSPITAL: { label: '병원', color: '#e53e3e' },
  CAFE: { label: '카페', color: '#3b82f6' },
  HOTEL: { label: '호텔', color: '#22c55e' },
}
