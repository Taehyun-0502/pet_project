// 지도류 화면(PetMap·MapPage·WalkPage) 공용 기본 좌표 — 서울시청.
// 위치 권한이 없거나 실패했을 때(또는 응답이 늦을 때) 쓰는 폴백 중심점이다.
//
// 이전에는 PetMap.jsx와 MapPage.jsx에 같은 값 `{ lat: 37.5665, lng: 126.978 }`이
// 각각 하드코딩돼 있었다(QA F-5 백로그 — "다음 지도 작업 시 common/으로 승격").
// 산책 Phase(2026-08-12) 착수를 계기로 이 파일 하나로 승격한다(동작 변경 없음,
// 값 그대로 이전). WalkPage.jsx도 동일 상수를 쓴다.
export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }
