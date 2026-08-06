/**
 * PetMap — 카카오맵 SDK를 감싼 공용 지도 컴포넌트.
 *
 * 루트 CLAUDE.md "Phase: 지도 + AI 장소 추천" 기획대로, 지도 렌더링·마커 색
 * 구분·카테고리 토글·컨트롤·장소 상세 팝업 로직을 이 컴포넌트 하나로
 * 통일한다. 화면별로 다시 구현하지 않고 이 컴포넌트를 재사용한다:
 *   ① 지도 단독 메뉴 — size="full"
 *   ② AI 챗봇 답변 카드 — size="mini"
 *
 * 카카오 JS 키(`VITE_KAKAO_JS_KEY`)가 설정되지 않은 경우, 빈 화면 대신
 * 안내 문구를 표시한다 (키 미발급 상태의 팀원도 다른 화면 작업을 막지
 * 않도록 하기 위함).
 *
 * 마커 클릭 시 카카오맵으로 이동시키지 않고, 이 컴포넌트 내부 공통
 * **하단 바텀시트**(2026-08-06 모바일 퍼스트 리디자인 — 기존 중앙 모달 폐기)로
 * 이름/카테고리 배지·상세/주소와 [전화 걸기]/[카카오맵에서 보기] 액션 버튼을
 * 보여준다. `phone`이 없으면 전화 버튼 자체를 숨긴다. 시트는 화면 하단에
 * 고정되고 지도 위쪽은 계속 보인다(전체 화면을 가리는 배경 없음, 얕은 스크림만).
 * `position: fixed`라 mini 모드(작은 컨테이너)에서도 화면 전체 기준 바텀시트로
 * 뜬다 — PetMap의 조상 요소들이 transform/filter 등으로 새 containing block을
 * 만들지 않는 한(현재 MapPage 등 사용처에 없음) 정상 동작한다. 데스크톱
 * (`min-width: 768px`)에서는 시트 너비가 520px로 제한되고 가로 중앙 정렬된다.
 * 접근성(기존 중앙 모달에서 그대로 이식 — QA N-2/N-4/N-5): 열릴 때 시트로
 * 포커스 이동 + Tab 트랩 + ESC로 닫기, 닫힐 때 이전 포커스로 복귀, 열려 있는
 * 동안 배경 스크롤 잠금. `places`가 교체되거나 카테고리 토글로 선택된 장소가
 * 가려지면 낡은(stale) 시트를 자동으로 닫는다.
 *
 * 줌(+/−)·"내 위치로 이동" 버튼은 카카오 기본 컨트롤 대신 커스텀 UI로 제공하며
 * (2026-08-06 확정 — 기본 컨트롤 비활성화 방침 유지), 터치 타깃을 넉넉히 잡는다
 * (줌 36px, 내 위치 44px 원형 아이콘 버튼 — 2026-08-06 모바일 퍼스트 리디자인).
 * 축척 표시는 좌하단 카카오 로고와 겹쳐 삭제됨 (2026-08-06 사용자 결정).
 *
 * `currentLocation`이 주어지면 파란 점 스타일의 현위치 마커를 표시하고,
 * 우하단 원형 "내 위치로 이동" 아이콘 버튼(`aria-label`로 텍스트 의미 유지)으로
 * 지도를 그 위치로 이동시킨다. 좌표가 아직 없는 상태에서 버튼을 누르면
 * `onLocateClick` 콜백을 호출해 상위 컴포넌트가 위치 획득(Geolocation 권한
 * 요청)을 트리거하도록 위임한다 — 이 컴포넌트는 브라우저 위치 권한을 직접
 * 요청하지 않는다(재사용성·권한 트리거 중복 방지를 위해 상위에 위임. 예:
 * src/hooks/useGeolocation.js).
 *
 * `onMapMoved`가 주어지면, 사용자가 드래그/스크롤 줌 등으로 지도를 직접
 * 움직였을 때(카카오 `idle` 이벤트) 현재 중심 좌표를 전달한다. 이 컴포넌트
 * 자신이 마커 범위에 맞추기 위해 수행하는 프로그래밍적 이동(장소 목록 변경 시
 * 범위 맞춤, 현위치 이동, 카테고리 토글 등)은 내부에서 구분해 걸러내므로
 * 호출되지 않는다 — "사용자가 실제로 지도를 움직였다"는 신호로만 쓰면 된다.
 * "이 지역에서 재검색" 버튼처럼 사용처가 원할 때만 쓰는 선택 기능이라,
 * 넘기지 않아도(mini 모드 등) 무해하다.
 *
 * `fitBoundsKey`(2026-08-06 확정 — 재검색 시 축척·중심 유지)로 "지금 보이는
 * places로 지도 범위를 다시 맞출지"를 사용처가 제어할 수 있다. 값이 바뀔
 * 때만 범위를 다시 맞추고(setBounds/setCenter), places만 바뀌면(같은 키) 마커만
 * 갱신하고 현재 축척·중심은 그대로 둔다. 카테고리 토글은 애초에 키와 무관하므로
 * (토글 자체가 범위 재조정을 유발하지 않음) 자연스럽게 축척이 유지된다.
 * `fitBoundsKey`를 아예 넘기지 않으면 이전과 동일하게 places/토글이 바뀔 때마다
 * 매번 범위를 맞춘다(mini 모드 등 기존 사용처는 이 prop 없이도 그대로 동작).
 *
 * `toggleSlot`(2026-08-06 확정 — 검색바와 토글 같은 줄 배치)으로 카테고리 토글
 * 칩의 "렌더링 위치"만 바꿀 수 있다. 상태·로직(visibleCategories, 카운트, 클릭
 * 핸들러)은 전부 이 컴포넌트에 그대로 있고, DOM 마운트 위치만 사용처가 넘긴
 * 노드로 포털(`createPortal`)한다 — 토글을 MapPage 등 사용처로 "꺼내는" 게
 * 아니라 내부 구현은 그대로 둔 채 어디에 그릴지만 바꾸는 것. 넘기지 않으면
 * 기존처럼 지도 좌상단에 떠 있는 오버레이로 렌더링한다(mini 모드 등 영향 없음).
 *
 * 사용 예시 — 지도 단독 메뉴(전체 화면), 위치 훅과 조합 + 지도 이동 감지 + 재검색 시 축척 유지:
 * ```jsx
 * const { location, requestLocation } = useGeolocation();
 * const [toggleSlotNode, setToggleSlotNode] = useState(null);
 *
 * <div className="map-page__search">
 *   <SearchBar ... />
 *   <div ref={setToggleSlotNode} /> // 검색바와 같은 줄에 토글이 포털될 자리
 * </div>
 *
 * <PetMap
 *   size="full"
 *   places={places}
 *   currentLocation={location}
 *   onLocateClick={requestLocation}
 *   onMapMoved={({ lat, lng }) => setResearchCenter({ lat, lng })}
 *   fitBoundsKey={fitBoundsKey} // 초기 진입·AI 검색 성공 시에만 증가시키고, 재검색 시엔 유지
 *   toggleSlot={toggleSlotNode}
 * />
 * ```
 *
 * 사용 예시 — 챗봇 답변 카드 안의 미니 지도 (신규 prop 없이 기존 동작 그대로):
 * ```jsx
 * {places.length > 0 && <PetMap size="mini" places={places} />}
 * ```
 *
 * Props
 * - places?: Array<{ name: string, category: 'HOSPITAL'|'CAFE'|'HOTEL',
 *     lat: number, lng: number, address?: string, placeUrl?: string,
 *     phone?: string, categoryDetail?: string }>
 *     백엔드 `POST /api/ai-search`·`GET /api/places` 응답의 `places[]`와 동일한
 *     형태(멤버 4 스키마). `phone`/`categoryDetail`은 선택 필드 — 없거나
 *     빈 값이면 상세 시트에서 해당 줄/버튼을 표시하지 않는다(하위 호환).
 * - size?: 'full' | 'mini' — 컨테이너 높이 프리셋. 기본 'full'.
 * - currentLocation?: { lat: number, lng: number } | null — 있으면 현위치
 *     마커를 표시한다.
 * - onLocateClick?: () => void — "내 위치로 이동" 버튼을 눌렀는데
 *     `currentLocation`이 아직 없을 때 호출된다(위치 획득 위임).
 * - onMapMoved?: ({ lat: number, lng: number }) => void — 사용자가 지도를
 *     직접 움직였을 때(드래그/줌 등) 호출된다. 이 컴포넌트의 자체 프로그래밍적
 *     이동은 걸러지므로 호출되지 않는다.
 * - onCenterChanged?: ({ lat: number, lng: number }) => void — 지도 중심이
 *     바뀔 때마다(이동 주체 무관 — 프로그래밍적 이동 포함) + 최초 생성 직후에
 *     현재 중심을 알린다. AI 검색이 "현재 보고 있는 지도" 기준으로 동작하기
 *     위한 좌표원 (2026-08-06 사용자 결정).
 * - onRegionChanged?: (regionName: string | null) => void — onCenterChanged와
 *     같은 시점(이동 주체 무관 + 최초 생성 직후)에, 그 중심 좌표를 카카오
 *     `services.Geocoder`로 역지오코딩한 행정구역명(예: "중구 명동")을 알린다.
 *     역지오코딩 실패 시 `null`을 전달한다. 이 prop을 넘기지 않으면 Geocoder
 *     호출 자체를 하지 않는다(검색바 위치 라벨 표시 등 실제로 필요한 화면만
 *     API 호출 비용을 지불하도록). 응답 순서 역전(idle 연속 발생) 방지를 위해
 *     내부적으로 요청 ID로 최신 응답만 반영하며, 직전 요청 좌표에서 150m 미만
 *     이동은 재요청을 건너뛴다(카카오 쿼터 절약 — QA M-1, 라벨이 동 단위라
 *     체감 차이 없음).
 *     라벨 세밀도는 줌 레벨과 무관하게 **동(3depth)까지가 최대**다
 *     (2026-08-06 사용자 결정 — 최대 줌인에서도 리(4depth)·도로명 등 더
 *     세밀한 단위는 표시하지 않는다).
 * - fitBoundsKey?: number | string — 값이 바뀔 때만 마커 범위로 지도를 다시
 *     맞춘다. 생략하면 매번(기존 동작) 맞춘다.
 * - toggleSlot?: HTMLElement | null — 주어지면 카테고리 토글 칩을 지도 위
 *     오버레이 대신 이 DOM 노드 안에 포털로 렌더링한다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadKakaoMaps } from './kakaoMapLoader';
import { distanceMeters } from '../common/geo';
import { buildRegionLabel } from '../common/regionLabel';
import './PetMap.css';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY;

// 카테고리별 마커 색 — 루트 CLAUDE.md 118행 기준(병원=빨강/카페=파랑/호텔=초록).
// design-agent의 디자인 토큰이 확정되면 이 상수를 토큰 참조로 교체한다.
const CATEGORY_META = {
  HOSPITAL: { label: '병원', color: '#e53e3e' },
  CAFE: { label: '카페', color: '#3b82f6' },
  HOTEL: { label: '호텔', color: '#22c55e' },
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청 — 위치 정보가 전혀 없을 때의 기본 중심

const MIN_LEVEL = 1;
const MAX_LEVEL = 14;

// 역지오코딩(지역 라벨) 재요청 최소 이동 거리 — 라벨 세밀도가 동(3depth) 단위라
// 이보다 짧은 이동은 결과가 바뀔 가능성이 낮다. 지도 idle마다 무조건 카카오 API를
// 호출해 쿼터를 낭비하지 않기 위한 억제 장치 (QA M-1, 2026-08-06).
const REGION_MIN_MOVE_METERS = 150;

function markerPinSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 26 16 26s16-15 16-26C32 7.163 24.837 0 16 0z" fill="${color}"/>
    <circle cx="16" cy="16" r="6" fill="#fff"/>
  </svg>`;
}

function currentLocationSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="9" fill="#3b82f6" fill-opacity="0.25"/>
    <circle cx="11" cy="11" r="5" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
  </svg>`;
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function PetMap({
  places = [],
  size = 'full',
  currentLocation = null,
  onLocateClick,
  onMapMoved,
  onCenterChanged,
  onRegionChanged,
  fitBoundsKey,
  toggleSlot = null,
}) {
  const containerRef = useRef(null);
  const kakaoRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null); // 역지오코딩(중심 좌표 → 행정구역명) — 지도 생성 시 1회 만들어 재사용
  const markerImagesRef = useRef({});
  const placeMarkersRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const pendingPanRef = useRef(false);
  const sheetPanelRef = useRef(null);
  const previousFocusRef = useRef(null); // 시트 열기 전 포커스였던 요소 — 닫을 때 복귀시킨다
  // fitBoundsKey가 마지막으로 범위를 맞췄을 때의 값. fitBoundsKey 자체를 아예
  // 넘기지 않은 경우(undefined)는 아래 이펙트에서 이 값과 무관하게 항상 맞춘다.
  const lastFitKeyRef = useRef(undefined);
  // 이 컴포넌트 자신이 지도를 움직인 경우(범위 맞춤/현위치 이동 등) true로 표시해두면,
  // 그 결과로 뒤이어 발생하는 'idle' 이벤트 1회를 "사용자가 움직인 게 아님"으로 걸러낸다.
  const programmaticMoveRef = useRef(false);
  // onMapMoved가 매 렌더 새 함수로 와도 idle 리스너(마운트 시 1회 등록)가 항상 최신을 참조하도록.
  const onMapMovedRef = useRef(onMapMoved);
  // onCenterChanged도 동일한 이유로 ref 경유. onMapMoved와 달리 프로그래밍적 이동을
  // 거르지 않고 "현재 지도 중심"을 항상 알려준다 — AI 검색이 보고 있는 지도 기준으로
  // 동작하기 위한 좌표원 (2026-08-06 사용자 결정).
  const onCenterChangedRef = useRef(onCenterChanged);
  // onRegionChanged도 동일한 이유로 ref 경유. 값이 없으면(undefined) 아래 역지오코딩
  // 요청 함수가 호출 자체를 건너뛴다(불필요한 API 호출 방지).
  const onRegionChangedRef = useRef(onRegionChanged);
  // coord2RegionCode 응답 순서 역전 방지 — idle이 연달아 발생하면 먼저 보낸 요청의
  // 응답이 나중에 도착할 수 있어, 요청마다 증가하는 ID로 최신 응답만 반영한다.
  const regionRequestIdRef = useRef(0);
  // 직전 역지오코딩 요청 좌표 — REGION_MIN_MOVE_METERS 미만 이동은 재요청을 건너뛴다 (QA M-1).
  const regionLastCoordsRef = useRef(null);
  // 'idle' 리스너 핸들러 참조 — 언마운트 cleanup에서 kakao.maps.event.removeListener로
  // 해제하기 위해 보관한다 (QA L-3).
  const idleHandlerRef = useRef(null);

  const [sdkStatus, setSdkStatus] = useState(KAKAO_JS_KEY ? 'loading' : 'missing-key');
  const [visibleCategories, setVisibleCategories] = useState({
    HOSPITAL: true,
    CAFE: true,
    HOTEL: true,
  });
  const [selectedPlace, setSelectedPlace] = useState(null); // 장소 상세 시트 — 클릭된 place 또는 null

  useEffect(() => {
    onMapMovedRef.current = onMapMoved;
    onCenterChangedRef.current = onCenterChanged;
    onRegionChangedRef.current = onRegionChanged;
  }, [onMapMoved, onCenterChanged, onRegionChanged]);

  // 지도 중심 좌표를 카카오 역지오코딩으로 행정구역명으로 변환해 onRegionChanged로
  // 알린다. onRegionChanged를 넘기지 않았거나 Geocoder가 아직 준비되지 않았으면
  // (SDK에 services 라이브러리가 로드되지 않은 등) 조용히 건너뛴다.
  const requestRegionLabel = (lat, lng) => {
    const kakao = kakaoRef.current;
    const geocoder = geocoderRef.current;
    if (!onRegionChangedRef.current || !kakao || !geocoder) return;

    // 직전 요청 좌표에서 충분히 이동했을 때만 재요청한다 (QA M-1 — idle마다 무조건
    // 호출하면 진입 직후 연속 idle(로드→fitBounds→재조회)과 미세 이동에도 매번
    // 카카오 쿼터를 소모). 임계 판정용이지 정밀 지리 계산이 필요한 곳이 아니므로
    // 공용 유틸 distanceMeters(하버사인)로 충분하다 (QA N-2 — 등장방형 근사 인라인
    // 계산을 src/common/geo.js로 통합).
    const last = regionLastCoordsRef.current;
    if (last && distanceMeters(last, { lat, lng }) < REGION_MIN_MOVE_METERS) return;
    regionLastCoordsRef.current = { lat, lng };

    const requestId = ++regionRequestIdRef.current;
    geocoder.coord2RegionCode(lng, lat, (result, status) => {
      if (regionRequestIdRef.current !== requestId) return; // 더 최신 요청이 이미 발생 — 폐기(언마운트 포함, QA L-3)

      if (status !== kakao.maps.services.Status.OK || !result || result.length === 0) {
        onRegionChangedRef.current?.(null);
        return;
      }

      onRegionChangedRef.current?.(buildRegionLabel(result));
    });
  };

  const categoryCounts = useMemo(() => {
    const counts = { HOSPITAL: 0, CAFE: 0, HOTEL: 0 };
    for (const place of places) {
      if (counts[place.category] !== undefined) counts[place.category] += 1;
    }
    return counts;
  }, [places]);

  const toggleCategory = (category) => {
    setVisibleCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  // SDK 로드 + 지도 인스턴스 생성 (컨테이너당 1회)
  useEffect(() => {
    if (!KAKAO_JS_KEY || !containerRef.current) return;

    let cancelled = false;

    loadKakaoMaps(KAKAO_JS_KEY)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        kakaoRef.current = kakao;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 5,
        });
        // 카카오 기본 컨트롤(줌/지도타입 버튼)은 addControl을 호출하지 않는 한
        // 표시되지 않는다 — 커스텀 줌 버튼으로 대체하는 기획에 따라 추가하지 않는다.
        mapRef.current = map;

        // services 라이브러리(kakaoMapLoader의 &libraries=services)가 로드된 경우에만
        // 존재 — 역지오코딩(중심 좌표 → 행정구역명)에 쓴다. 1회만 생성해 재사용.
        if (kakao.maps.services) {
          geocoderRef.current = new kakao.maps.services.Geocoder();
        }

        // 'idle'은 드래그/줌 등 지도 이동이 끝나고 안정된 시점에 1회 발생한다.
        // programmaticMoveRef가 true면(이 컴포넌트 자신이 방금 움직인 경우) 이번
        // idle 1회만 소비하고 onMapMoved는 호출하지 않는다 — 그 외에는 사용자가
        // 직접 움직인 것으로 보고 현재 중심 좌표를 알려준다.
        // 최초 생성 직후에도 중심을 한 번 알린다 — 사용자가 지도를 안 움직여도
        // AI 검색이 "지금 보이는 지도" 좌표를 쓸 수 있게.
        onCenterChangedRef.current?.({ ...DEFAULT_CENTER });
        requestRegionLabel(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);

        // 핸들러를 ref에 보관해두면 언마운트 cleanup에서 removeListener로 해제할 수 있다 (QA L-3).
        const handleIdle = () => {
          const center = map.getCenter();
          const coords = { lat: center.getLat(), lng: center.getLng() };
          // onCenterChanged는 이동 주체와 무관하게 항상 최신 중심을 보고한다.
          onCenterChangedRef.current?.(coords);
          // onRegionChanged도 동일하게 이동 주체(사용자/프로그래밍적)와 무관하게 갱신 —
          // 단, 직전 요청 좌표에서 150m 미만 이동은 requestRegionLabel 내부에서 스킵된다 (QA M-1).
          requestRegionLabel(coords.lat, coords.lng);
          if (programmaticMoveRef.current) {
            programmaticMoveRef.current = false;
            return;
          }
          onMapMovedRef.current?.(coords);
        };
        idleHandlerRef.current = handleIdle;
        kakao.maps.event.addListener(map, 'idle', handleIdle);

        markerImagesRef.current = {
          HOSPITAL: new kakao.maps.MarkerImage(
            svgToDataUrl(markerPinSvg(CATEGORY_META.HOSPITAL.color)),
            new kakao.maps.Size(32, 42),
            { offset: new kakao.maps.Point(16, 42) },
          ),
          CAFE: new kakao.maps.MarkerImage(
            svgToDataUrl(markerPinSvg(CATEGORY_META.CAFE.color)),
            new kakao.maps.Size(32, 42),
            { offset: new kakao.maps.Point(16, 42) },
          ),
          HOTEL: new kakao.maps.MarkerImage(
            svgToDataUrl(markerPinSvg(CATEGORY_META.HOTEL.color)),
            new kakao.maps.Size(32, 42),
            { offset: new kakao.maps.Point(16, 42) },
          ),
          CURRENT: new kakao.maps.MarkerImage(
            svgToDataUrl(currentLocationSvg()),
            new kakao.maps.Size(22, 22),
            { offset: new kakao.maps.Point(11, 11) },
          ),
        };

        setSdkStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setSdkStatus('error');
      });

    return () => {
      cancelled = true;

      // QA L-3(언마운트 정리): 'idle' 리스너 해제. 지도가 아직 생성되기 전에
      // 언마운트되는 경우(loadKakaoMaps가 resolve되기 전)에는 map/handler가
      // null이므로 널 가드로 안전하게 건너뛴다.
      const kakao = kakaoRef.current;
      const map = mapRef.current;
      if (kakao && map && idleHandlerRef.current) {
        kakao.maps.event.removeListener(map, 'idle', idleHandlerRef.current);
      }

      // QA L-3: 인플라이트 역지오코딩(coord2RegionCode) 요청을 무효화한다. requestId를
      // 증가시켜두면, 언마운트 이후 도착하는 콜백이 "더 최신 요청이 이미 발생"
      // 가드에 걸려 폐기되고 부모 setState(onRegionChanged)를 호출하지 않는다.
      regionRequestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 지도 인스턴스는 마운트당 1회만 생성
  }, []);

  // 장소 마커 렌더링 (places / 카테고리 토글 변경 시)
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (sdkStatus !== 'ready' || !kakao || !map) return;

    // 이전 마커 정리
    for (const marker of placeMarkersRef.current) {
      marker.setMap(null);
    }
    placeMarkersRef.current = [];

    const visiblePlaces = places.filter((place) => visibleCategories[place.category]);

    for (const place of visiblePlaces) {
      const position = new kakao.maps.LatLng(place.lat, place.lng);
      const marker = new kakao.maps.Marker({
        position,
        image: markerImagesRef.current[place.category],
        title: place.name,
      });
      marker.setMap(map);
      // 마커 클릭 → 카카오 InfoWindow 대신 컴포넌트 내부 공통 하단 시트를 연다(2026-08-06 확정).
      kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
      });
      placeMarkersRef.current.push(marker);
    }

    // 범위를 다시 맞출지 여부(2026-08-06 확정 — 재검색 시 축척·중심 유지):
    // fitBoundsKey를 아예 안 넘겼으면(undefined) 항상 맞춘다(기존 동작, mini 모드 등).
    // 넘겼으면 그 값이 "마지막으로 맞췄을 때"와 달라졌을 때만 맞춘다 — 재검색처럼
    // places만 바뀌고 키는 그대로인 갱신은 마커만 갈아끼우고 축척·중심은 그대로 둔다.
    // (카테고리 토글도 키와 무관하므로 자연히 범위 재조정을 유발하지 않는다.)
    const shouldFit = fitBoundsKey === undefined || lastFitKeyRef.current !== fitBoundsKey;

    if (shouldFit) {
      lastFitKeyRef.current = fitBoundsKey;

      // 보이는 마커 + 현위치가 있으면 함께 화면에 들어오도록 범위를 맞춘다.
      const boundsPoints = visiblePlaces.map((place) => new kakao.maps.LatLng(place.lat, place.lng));
      if (currentLocation) {
        boundsPoints.push(new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
      }

      // 아래 setCenter/setBounds는 이 컴포넌트 자신의 프로그래밍적 이동이다 —
      // 뒤이어 발생할 'idle' 1회를 onMapMoved에서 걸러내도록 미리 표시해둔다.
      if (boundsPoints.length === 1) {
        programmaticMoveRef.current = true;
        map.setCenter(boundsPoints[0]);
      } else if (boundsPoints.length > 1) {
        programmaticMoveRef.current = true;
        const bounds = new kakao.maps.LatLngBounds();
        for (const point of boundsPoints) bounds.extend(point);
        map.setBounds(bounds);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentLocation은 범위 계산에만 참고, 별도 이펙트에서 마커 관리
  }, [places, visibleCategories, sdkStatus, fitBoundsKey]);

  // 현위치 마커 렌더링/갱신
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (sdkStatus !== 'ready' || !kakao || !map) return;

    if (!currentLocation) {
      currentMarkerRef.current?.setMap(null);
      currentMarkerRef.current = null;
      return;
    }

    const position = new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng);
    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new kakao.maps.Marker({
        position,
        image: markerImagesRef.current.CURRENT,
        title: '현재 위치',
        zIndex: 10,
      });
      currentMarkerRef.current.setMap(map);
    } else {
      currentMarkerRef.current.setPosition(position);
    }

    // "내 위치로 이동" 버튼이 위치 획득을 막 트리거해 좌표가 도착한 경우에만 자동으로 이동.
    if (pendingPanRef.current) {
      programmaticMoveRef.current = true;
      map.panTo(position);
      pendingPanRef.current = false;
    }
  }, [currentLocation, sdkStatus]);

  // 장소 상세 시트 접근성(기존 중앙 모달에서 그대로 이식 — QA N-2/N-4): 열릴 때 패널로
  // 포커스 이동 + Tab 트랩(패널 안에서만 순환) + ESC로 닫기 + 배경 스크롤 잠금,
  // 닫힐 때 열기 전 포커스였던 요소로 복귀.
  useEffect(() => {
    if (!selectedPlace) return;

    previousFocusRef.current = document.activeElement;
    sheetPanelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedPlace(null);
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = sheetPanelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [selectedPlace]);

  // places가 교체되거나(새 조회/AI 검색 결과 전환) 카테고리 토글로 선택된 장소가
  // 화면에서 사라지면 시트가 낡은(stale) 장소를 계속 띄우고 있지 않도록 닫는다(QA N-5).
  useEffect(() => {
    if (!selectedPlace) return;
    const stillVisible = places.includes(selectedPlace) && visibleCategories[selectedPlace.category];
    if (!stillVisible) setSelectedPlace(null);
  }, [places, visibleCategories, selectedPlace]);

  const handleLocateClick = () => {
    if (currentLocation && mapRef.current && kakaoRef.current) {
      programmaticMoveRef.current = true;
      mapRef.current.panTo(new kakaoRef.current.maps.LatLng(currentLocation.lat, currentLocation.lng));
      return;
    }
    pendingPanRef.current = true;
    onLocateClick?.();
  };

  const handleZoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setLevel(Math.max(MIN_LEVEL, map.getLevel() - 1));
  };

  const handleZoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setLevel(Math.min(MAX_LEVEL, map.getLevel() + 1));
  };

  const handleBackdropClick = (event) => {
    // 배경(오버레이) 자체를 클릭했을 때만 닫는다 — 패널 내부 클릭은 이 핸들러까지 버블링되지
    // 않도록 패널 쪽에서 stopPropagation한다.
    if (event.target === event.currentTarget) setSelectedPlace(null);
  };

  if (sdkStatus === 'missing-key') {
    return (
      <div className={`pet-map pet-map--${size} pet-map__notice`}>
        <p>카카오맵 키가 설정되지 않았습니다.</p>
        <p className="pet-map__notice-hint">
          `.env`에 `VITE_KAKAO_JS_KEY`를 설정하세요 (pet_frontend/.env.example 참고).
        </p>
      </div>
    );
  }

  if (sdkStatus === 'error') {
    return (
      <div className={`pet-map pet-map--${size} pet-map__notice`}>
        <p>카카오맵을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  const selectedMeta = selectedPlace ? CATEGORY_META[selectedPlace.category] : null;

  // 토글 칩 마크업/상태/핸들러는 전부 여기(PetMap) 소유 — toggleSlot이 주어지면
  // 그리는 "위치"만 그 DOM 노드로 포털한다(내부 구현을 MapPage 등으로 옮기지 않음).
  const toggleChips = (
    <div
      className={`pet-map__toggle-list${toggleSlot ? '' : ' pet-map__toggle-list--floating'}`}
      role="group"
      aria-label="장소 카테고리 표시 전환"
    >
      {Object.entries(CATEGORY_META).map(([category, meta]) => (
        <button
          key={category}
          type="button"
          className={`pet-map__toggle-chip${visibleCategories[category] ? ' pet-map__toggle-chip--on' : ''}`}
          style={{ '--chip-color': meta.color }}
          aria-pressed={visibleCategories[category]}
          // 현재 표시 중인 목록에 해당 카테고리 장소가 없으면 비활성 (2026-08-06 사용자 결정)
          disabled={categoryCounts[category] === 0}
          onClick={() => toggleCategory(category)}
        >
          <span className="pet-map__toggle-dot" />
          {meta.label}
          {categoryCounts[category] > 0 ? ` (${categoryCounts[category]})` : ''}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`pet-map pet-map--${size}`}>
      <div ref={containerRef} className="pet-map__canvas" />

      {toggleSlot ? createPortal(toggleChips, toggleSlot) : toggleChips}

      <div className="pet-map__zoom-control" role="group" aria-label="지도 확대/축소">
        <button
          type="button"
          className="pet-map__zoom-btn"
          onClick={handleZoomIn}
          aria-label="확대"
          disabled={sdkStatus !== 'ready'}
        >
          +
        </button>
        <button
          type="button"
          className="pet-map__zoom-btn"
          onClick={handleZoomOut}
          aria-label="축소"
          disabled={sdkStatus !== 'ready'}
        >
          −
        </button>
      </div>

      <button
        type="button"
        className="pet-map__locate-btn"
        onClick={handleLocateClick}
        aria-label="내 위치로 이동"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {selectedPlace && (
        <div className="pet-map__sheet-backdrop" onMouseDown={handleBackdropClick}>
          <div
            ref={sheetPanelRef}
            className="pet-map__sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedPlace.name} 상세 정보`}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="pet-map__sheet-handle" aria-hidden="true" />

            <button
              type="button"
              className="pet-map__sheet-close"
              onClick={() => setSelectedPlace(null)}
              aria-label="닫기"
            >
              ×
            </button>

            {(selectedMeta || selectedPlace.categoryDetail) && (
              <div className="pet-map__sheet-badge-row">
                {selectedMeta && (
                  <span
                    className="pet-map__sheet-badge"
                    style={{ '--chip-color': selectedMeta.color }}
                  >
                    {selectedMeta.label}
                  </span>
                )}
                {selectedPlace.categoryDetail && (
                  <span className="pet-map__sheet-category-detail">{selectedPlace.categoryDetail}</span>
                )}
              </div>
            )}

            <h3 className="pet-map__sheet-title">{selectedPlace.name}</h3>

            {selectedPlace.address && (
              <p className="pet-map__sheet-address">{selectedPlace.address}</p>
            )}

            {(selectedPlace.phone || selectedPlace.placeUrl) && (
              <div className="pet-map__sheet-actions">
                {selectedPlace.phone && (
                  <a
                    className="pet-map__sheet-action-btn pet-map__sheet-action-btn--primary"
                    href={`tel:${selectedPlace.phone}`}
                  >
                    전화 걸기
                  </a>
                )}
                {selectedPlace.placeUrl && (
                  <a
                    className="pet-map__sheet-action-btn"
                    href={selectedPlace.placeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    카카오맵에서 보기
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PetMap;
