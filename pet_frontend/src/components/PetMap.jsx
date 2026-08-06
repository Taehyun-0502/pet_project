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
 * 마커 클릭 시 카카오맵으로 이동시키지 않고, 이 컴포넌트 내부 공통 모달
 * 팝업(이름/카테고리 배지·상세/주소/전화, 보조 링크로 "카카오맵에서 자세히
 * 보기")을 띄운다(2026-08-06 확정). 모달은 `position: fixed`로 뷰포트 전체를
 * 덮으므로 mini 모드(작은 컨테이너)에서도 동일하게 화면 전체 오버레이로 뜬다
 * — PetMap의 조상 요소들이 transform/filter 등으로 새 containing block을
 * 만들지 않는 한(현재 MapPage 등 사용처에 없음) 정상 동작한다.
 * 접근성: 열릴 때 패널로 포커스 이동 + Tab 트랩 + ESC로 닫기, 닫힐 때 이전
 * 포커스로 복귀, 열려 있는 동안 배경 스크롤 잠금. `places`가 교체되거나
 * 카테고리 토글로 선택된 장소가 가려지면 낡은(stale) 모달을 자동으로 닫는다.
 *
 * 줌(+/−) 버튼은 카카오 기본 컨트롤 대신 커스텀 UI로 제공한다
 * (2026-08-06 확정 — 기본 컨트롤 비활성화 방침 유지).
 * 축척 표시는 좌하단 카카오 로고와 겹쳐 삭제됨 (2026-08-06 사용자 결정).
 *
 * `currentLocation`이 주어지면 파란 점 스타일의 현위치 마커를 표시하고,
 * "내 위치로 이동" 버튼으로 지도를 그 위치로 이동시킨다. 좌표가 아직
 * 없는 상태에서 버튼을 누르면 `onLocateClick` 콜백을 호출해 상위
 * 컴포넌트가 위치 획득(Geolocation 권한 요청)을 트리거하도록 위임한다 —
 * 이 컴포넌트는 브라우저 위치 권한을 직접 요청하지 않는다(재사용성·권한
 * 트리거 중복 방지를 위해 상위에 위임. 예: src/hooks/useGeolocation.js).
 *
 * `onMapMoved`가 주어지면, 사용자가 드래그/스크롤 줌 등으로 지도를 직접
 * 움직였을 때(카카오 `idle` 이벤트) 현재 중심 좌표를 전달한다. 이 컴포넌트
 * 자신이 마커 범위에 맞추기 위해 수행하는 프로그래밍적 이동(장소 목록 변경 시
 * 범위 맞춤, 현위치 이동, 카테고리 토글 등)은 내부에서 구분해 걸러내므로
 * 호출되지 않는다 — "사용자가 실제로 지도를 움직였다"는 신호로만 쓰면 된다.
 * "이 지역에서 재검색" 버튼처럼 사용처가 원할 때만 쓰는 선택 기능이라,
 * 넘기지 않아도(mini 모드 등) 무해하다.
 *
 * 사용 예시 — 지도 단독 메뉴(전체 화면), 위치 훅과 조합 + 지도 이동 감지:
 * ```jsx
 * const { location, requestLocation } = useGeolocation();
 *
 * <PetMap
 *   size="full"
 *   places={places}
 *   currentLocation={location}
 *   onLocateClick={requestLocation}
 *   onMapMoved={({ lat, lng }) => setResearchCenter({ lat, lng })}
 * />
 * ```
 *
 * 사용 예시 — 챗봇 답변 카드 안의 미니 지도:
 * ```jsx
 * {places.length > 0 && <PetMap size="mini" places={places} />}
 * ```
 *
 * Props
 * - places?: Array<{ name: string, category: 'HOSPITAL'|'CAFE'|'HOTEL',
 *     lat: number, lng: number, address?: string, placeUrl?: string,
 *     phone?: string, categoryDetail?: string }>
 *     백엔드 `POST /api/chat`·`GET /api/places` 응답의 `places[]`와 동일한
 *     형태(멤버 4 스키마). `phone`/`categoryDetail`은 선택 필드 — 없거나
 *     빈 값이면 상세 모달에서 해당 줄을 표시하지 않는다(하위 호환).
 * - size?: 'full' | 'mini' — 컨테이너 높이 프리셋. 기본 'full'.
 * - currentLocation?: { lat: number, lng: number } | null — 있으면 현위치
 *     마커를 표시한다.
 * - onLocateClick?: () => void — "내 위치로 이동" 버튼을 눌렀는데
 *     `currentLocation`이 아직 없을 때 호출된다(위치 획득 위임).
 * - onMapMoved?: ({ lat: number, lng: number }) => void — 사용자가 지도를
 *     직접 움직였을 때(드래그/줌 등) 호출된다. 이 컴포넌트의 자체 프로그래밍적
 *     이동은 걸러지므로 호출되지 않는다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadKakaoMaps } from './kakaoMapLoader';
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
}) {
  const containerRef = useRef(null);
  const kakaoRef = useRef(null);
  const mapRef = useRef(null);
  const markerImagesRef = useRef({});
  const placeMarkersRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const pendingPanRef = useRef(false);
  const modalPanelRef = useRef(null);
  const previousFocusRef = useRef(null); // 모달 열기 전 포커스였던 요소 — 닫을 때 복귀시킨다
  // 이 컴포넌트 자신이 지도를 움직인 경우(범위 맞춤/현위치 이동 등) true로 표시해두면,
  // 그 결과로 뒤이어 발생하는 'idle' 이벤트 1회를 "사용자가 움직인 게 아님"으로 걸러낸다.
  const programmaticMoveRef = useRef(false);
  // onMapMoved가 매 렌더 새 함수로 와도 idle 리스너(마운트 시 1회 등록)가 항상 최신을 참조하도록.
  const onMapMovedRef = useRef(onMapMoved);

  const [sdkStatus, setSdkStatus] = useState(KAKAO_JS_KEY ? 'loading' : 'missing-key');
  const [visibleCategories, setVisibleCategories] = useState({
    HOSPITAL: true,
    CAFE: true,
    HOTEL: true,
  });
  const [selectedPlace, setSelectedPlace] = useState(null); // 장소 상세 모달 — 클릭된 place 또는 null

  useEffect(() => {
    onMapMovedRef.current = onMapMoved;
  }, [onMapMoved]);

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

        // 'idle'은 드래그/줌 등 지도 이동이 끝나고 안정된 시점에 1회 발생한다.
        // programmaticMoveRef가 true면(이 컴포넌트 자신이 방금 움직인 경우) 이번
        // idle 1회만 소비하고 onMapMoved는 호출하지 않는다 — 그 외에는 사용자가
        // 직접 움직인 것으로 보고 현재 중심 좌표를 알려준다.
        kakao.maps.event.addListener(map, 'idle', () => {
          if (programmaticMoveRef.current) {
            programmaticMoveRef.current = false;
            return;
          }
          const center = map.getCenter();
          onMapMovedRef.current?.({ lat: center.getLat(), lng: center.getLng() });
        });

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
      // 마커 클릭 → 카카오 InfoWindow 대신 컴포넌트 내부 공통 모달을 연다(2026-08-06 확정).
      kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
      });
      placeMarkersRef.current.push(marker);
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentLocation은 범위 계산에만 참고, 별도 이펙트에서 마커 관리
  }, [places, visibleCategories, sdkStatus]);

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

  // 장소 상세 모달 접근성: 열릴 때 패널로 포커스 이동 + Tab 트랩(패널 안에서만 순환) +
  // ESC로 닫기 + 배경 스크롤 잠금, 닫힐 때 열기 전 포커스였던 요소로 복귀.
  useEffect(() => {
    if (!selectedPlace) return;

    previousFocusRef.current = document.activeElement;
    modalPanelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedPlace(null);
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = modalPanelRef.current;
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
  // 화면에서 사라지면 모달이 낡은(stale) 장소를 계속 띄우고 있지 않도록 닫는다.
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

  return (
    <div className={`pet-map pet-map--${size}`}>
      <div ref={containerRef} className="pet-map__canvas" />

      <div className="pet-map__toggles" role="group" aria-label="장소 카테고리 표시 전환">
        {Object.entries(CATEGORY_META).map(([category, meta]) => (
          <button
            key={category}
            type="button"
            className={`pet-map__toggle-chip${visibleCategories[category] ? ' pet-map__toggle-chip--on' : ''}`}
            style={{ '--chip-color': meta.color }}
            aria-pressed={visibleCategories[category]}
            onClick={() => toggleCategory(category)}
          >
            <span className="pet-map__toggle-dot" />
            {meta.label}
            {categoryCounts[category] > 0 ? ` (${categoryCounts[category]})` : ''}
          </button>
        ))}
      </div>

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

      <button type="button" className="pet-map__locate-btn" onClick={handleLocateClick}>
        내 위치로 이동
      </button>

      {selectedPlace && (
        <div className="pet-map__modal-backdrop" onMouseDown={handleBackdropClick}>
          <div
            ref={modalPanelRef}
            className="pet-map__modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedPlace.name} 상세 정보`}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="pet-map__modal-close"
              onClick={() => setSelectedPlace(null)}
              aria-label="닫기"
            >
              ×
            </button>

            {(selectedMeta || selectedPlace.categoryDetail) && (
              <div className="pet-map__modal-badge-row">
                {selectedMeta && (
                  <span
                    className="pet-map__modal-badge"
                    style={{ '--chip-color': selectedMeta.color }}
                  >
                    {selectedMeta.label}
                  </span>
                )}
                {selectedPlace.categoryDetail && (
                  <span className="pet-map__modal-category-detail">{selectedPlace.categoryDetail}</span>
                )}
              </div>
            )}

            <h3 className="pet-map__modal-title">{selectedPlace.name}</h3>

            {selectedPlace.address && (
              <p className="pet-map__modal-address">{selectedPlace.address}</p>
            )}

            {selectedPlace.phone && (
              <a className="pet-map__modal-phone" href={`tel:${selectedPlace.phone}`}>
                전화 걸기 · {selectedPlace.phone}
              </a>
            )}

            {selectedPlace.placeUrl && (
              <a
                className="pet-map__modal-link"
                href={selectedPlace.placeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                카카오맵에서 자세히 보기
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PetMap;
