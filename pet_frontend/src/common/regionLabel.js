// 카카오 역지오코딩 응답 → 지역 라벨 조립 순수 함수.
// PetMap.jsx에서 분리(QA L-5) — 컴포넌트 파일에 named export를 두면 Fast Refresh
// 경고(only-export-components)가 발생해, geo.js와 같은 common/ 모듈로 옮겼다.
// SDK/컴포넌트 상태와 무관하며 입력 배열만으로 결정된다.

/**
 * 카카오 `Geocoder.coord2RegionCode` 응답 배열을 "구+동" 형태의 지역 라벨 문자열로
 * 조립한다 (동작은 PetMap 내부 구현 시절과 동일 — 향후 vitest 도입 시 단위 테스트 대상).
 *
 * @param {Array<{region_type: string, region_1depth_name?: string,
 *   region_2depth_name?: string, region_3depth_name?: string}>} result
 *   coord2RegionCode의 성공 응답 결과 배열 (status === OK, 비어있지 않음을 호출부가 보장).
 * @returns {string | null} "중구 명동" 형태의 라벨. 조립 결과가 빈 문자열이면 null.
 */
export function buildRegionLabel(result) {
  // region_type === 'H'(행정동)를 우선하고 없으면 첫 결과(보통 'B' 법정동)를 쓴다.
  const target = result.find((item) => item.region_type === 'H') ?? result[0];
  const depth2 = target.region_2depth_name;
  // "구+동" 형태(예: "중구 명동"). 2depth는 지역에 따라 형태가 다르다 —
  // 서울/광역시는 구 하나만("중구"), 그 외 비광역시는 "부천시 소사구"처럼 시+구가
  // 통째로 들어오고, 구가 없는 시/군은 "김포시"/"양평군"만 온다. 어느 경우든
  // **마지막 어절**만 쓰면 사용자 확정 형태("소사구 괴안동", "김포시 사우동",
  // "양평군 양평읍")로 일관되게 좁혀진다 (split(' ').at(-1)).
  // 2depth가 비어 있으면(세종시처럼 구가 없는 광역 단위) 시(1depth)+동으로 폴백해
  // 어느 지역이든 두 단위 표시를 유지한다 (예: "세종특별자치시 보람동" —
  // 2026-08-06 사용자 확정, QA L-2 해소. 구가 없으면 구 자리를 시가 대신한다).
  // 세밀도 상한은 동(3depth) — 최대 줌인에서도 리(region_4depth_name)·도로명 등
  // 더 세밀한 단위는 라벨에 포함하지 않는다 (2026-08-06 사용자 결정. coord2RegionCode는
  // 줌과 무관하게 좌표만으로 응답하므로, 4depth를 여기서 쓰지 않는 것으로 보장된다).
  const depth2Tail = depth2 ? depth2.split(' ').at(-1) : '';
  const label = depth2
    ? `${depth2Tail} ${target.region_3depth_name || ''}`.trim()
    : `${target.region_1depth_name || ''} ${target.region_3depth_name || ''}`.trim();
  return label || null;
}
