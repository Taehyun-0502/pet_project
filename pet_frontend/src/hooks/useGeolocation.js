import { useCallback, useRef, useState } from 'react';

/**
 * useGeolocation — 브라우저 Geolocation API 래퍼 훅.
 *
 * 루트 CLAUDE.md "Phase: 지도 + AI 장소 추천"의 현재 위치 지원 방침에 따라
 * 위치 획득·권한 동의는 브라우저 Geolocation API가 담당한다. 이 훅 자체는
 * 마운트 시 자동으로 요청하지 않는다 — `requestLocation()`을 호출한 시점에만
 * 브라우저 권한 프롬프트가 뜬다. (지도 페이지에서 마운트 직후 1회 호출할지,
 * 사용자 액션에서만 호출할지는 호출부가 정책으로 결정한다.)
 *
 * 반환값
 * - location: { lat, lng } | null — 마지막으로 획득한 좌표. 실패/미요청 시 null.
 * - status: 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'
 * - requestLocation: () => Promise<{ lat, lng } | null>
 *     권한 거부/실패/브라우저 미지원 시 null로 resolve된다 (reject하지 않음 —
 *     호출부가 매번 try/catch 없이 "좌표 없이 진행" 폴백을 쓸 수 있게 하려는 의도).
 *     이미 진행 중인 요청이 있을 때 다시 호출하면 새 브라우저 호출을 또 띄우지
 *     않고 진행 중인 동일 Promise를 그대로 반환한다 (버튼 연타·중복 트리거로
 *     인한 권한 프롬프트/GPS 조회 중복 방지). 호출부가 매번 `status`를 보고
 *     직접 방지 로직을 짤 필요는 없지만, "이미 거부된 뒤 다시 요청하지 않기"
 *     같은 상위 정책(예: 검색마다 재요청 금지)은 여전히 호출부의 책임이다.
 *
 * 사용 예시 — 마운트 시 1회 요청 후 결과로 초기 데이터 로드:
 * ```jsx
 * const { requestLocation } = useGeolocation();
 *
 * useEffect(() => {
 *   requestLocation().then((loc) => loadNearby(loc ?? DEFAULT_CENTER));
 * }, [requestLocation]);
 * ```
 *
 * 사용 예시 — 이후 동작에서는 상태를 보고 재요청 여부를 직접 판단:
 * ```jsx
 * const { location, status, requestLocation } = useGeolocation();
 *
 * // loading 중이면 기다리지 않고 진행, denied/unsupported면 재요청하지 않음 —
 * // idle일 때만(아직 한 번도 시도 안 함) 이 자리에서 직접 요청
 * let loc = location;
 * if (!loc && status === 'idle') {
 *   loc = await requestLocation();
 * }
 * ```
 */
export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const pendingRef = useRef(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported');
      return Promise.resolve(null);
    }

    // 이미 진행 중인 요청이 있으면 그 결과를 공유한다 — 중복 권한 프롬프트/GPS 조회 방지.
    if (pendingRef.current) {
      return pendingRef.current;
    }

    setStatus('loading');
    const promise = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = { lat: position.coords.latitude, lng: position.coords.longitude };
          setLocation(next);
          setStatus('granted');
          pendingRef.current = null;
          resolve(next);
        },
        () => {
          // 거부, 타임아웃, 위치 확인 불가 등 — 모두 "좌표 없이 진행"으로 처리
          setStatus('denied');
          pendingRef.current = null;
          resolve(null);
        },
        { timeout: 5000 },
      );
    });
    pendingRef.current = promise;
    return promise;
  }, []);

  return { location, status, requestLocation };
}
