import { useEffect, useRef } from 'react';
import { useGeolocation } from './useGeolocation';
import { DEFAULT_CENTER } from '../common/mapDefaults';

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * useInitialLocation — "위치 권한 응답 3초 대기 → 늦으면 기본 좌표로 먼저 진행 →
 * 늦은 허용 시 1회 갱신" race 패턴 승격 (2026-08-26 QA L-3 우선순위 리팩토링).
 *
 * MapPage.jsx·WalkPage.jsx·NearbyPlaces.jsx 3곳에 복붙돼 있던 로직을 하나로
 * 묶는다. 버그 실증(원본 주석, 세 파일에 동일하게 있던 내용): 사용자가 브라우저
 * 위치 권한 팝업에 응답하지 않으면 `getCurrentPosition`의 두 콜백(성공/실패) 모두
 * 영영 발화하지 않는다 — Geolocation의 `timeout` 옵션은 "허용 후 위치 확인이 오래
 * 걸릴 때"만 적용되고, 팝업 자체가 방치된 경우에는 동작하지 않는다. 그래서 여기서는
 * 위치 확정을 최대 `timeoutMs`(기본 3초)만 기다리고, 못 받으면 일단 기본 좌표로
 * `onResolve`를 1회 호출한 뒤, 이후 위치가 "허용"으로 늦게 도착하면(옵션에 따라)
 * 그 좌표로 `onResolve`를 1회 더 호출한다.
 *
 * 이 훅 자체는 `useGeolocation`의 얇은 오케스트레이션 레이어일 뿐, 위치 응답으로
 * "무엇을 조회할지"는 모른다 — 그 결정은 전부 `onResolve` 콜백(호출부)의 몫이다.
 * `useGeolocation`과의 역할 경계: `useGeolocation`은 Geolocation API 자체를
 * 감싼 범용 훅(요청 시점·중복 방지만 담당, 초기 로드 정책은 모른다)이고, 이
 * 훅은 그 위에 "마운트 시 1회, 3초 race, 선택적 늦은 보정"이라는 초기 로드
 * 정책 하나를 얹은 것이다. "내 위치로 이동" 버튼처럼 race와 무관한 재요청은
 * 여전히 이 훅이 반환하는 `requestLocation`을 호출부가 직접 쓰면 된다
 * (MapPage.jsx의 `handleLocateClick`처럼 — 이 훅이 관여하지 않음).
 *
 * 세 호출부의 차이는 전부 `onResolve` 콜백 안에서 흡수된다 — 이 훅은 이벤트
 * (기본 좌표로 확정/실제 좌표로 확정/뒤늦은 보정)만 알려준다:
 * - MapPage: 어느 경우든(fallback/즉시 허용/늦은 보정) 항상 `fit: true`로 재조회
 *   → `onResolve`가 매번 동일하게 동작하면 되므로 `meta`를 참고할 필요가 없다.
 * - WalkPage: 실제 좌표(`granted`)일 때만 지도를 그 위치로 다시 맞추고(fitBoundsKey
 *   증가), 기본 좌표 폴백일 때는 날씨만 조회 → `meta.granted`로 분기.
 * - NearbyPlaces: 늦은 보정을 아예 원하지 않는다(부가 섹션이라 한 번의 조회로
 *   충분) → `lateCorrection: false`로 끈다.
 *
 * @param {object} options
 * @param {(center: {lat:number,lng:number}, meta: {granted:boolean,late:boolean}) => void} options.onResolve
 *   위치가 "확정"될 때마다 호출된다. `granted`는 실제 브라우저 좌표(true)인지
 *   `DEFAULT_CENTER` 폴백(false)인지, `late`는 3초 타임아웃으로 먼저 폴백을
 *   확정한 뒤 뒤늦게 도착한 보정 호출인지를 나타낸다.
 * @param {number} [options.timeoutMs=3000] - 위치 확정을 기다리는 최대 시간(ms).
 * @param {boolean} [options.enabled=true] - false면 위치 요청·타이머를 아예 시작하지
 *   않는다(NearbyPlaces의 `deferred` 모드처럼 "버튼을 누르기 전까지 보류"할 때 사용 —
 *   false→true로 바뀌는 시점에 race가 시작된다).
 * @param {boolean} [options.lateCorrection=true] - 타임아웃으로 먼저 폴백을 확정한
 *   뒤, 위치가 "허용"으로 늦게 도착했을 때 `onResolve`를 한 번 더 호출할지 여부.
 * @param {*} [options.resetKey] - 이 값이 바뀌면 race를 처음부터 다시 시작한다
 *   (NearbyPlaces가 `categories` prop이 바뀌면 위치 확정부터 다시 하던 기존
 *   동작을 그대로 재현하기 위한 탈출구 — MapPage/WalkPage는 넘기지 않는다).
 * @returns {{ location: {lat:number,lng:number}|null, status: string, requestLocation: () => Promise<{lat:number,lng:number}|null> }}
 *   `useGeolocation`의 반환값을 그대로 통과시킨다 — PetMap의 `currentLocation`·
 *   `onLocateClick`으로 그대로 연결하거나, race와 무관한 수동 재요청에 쓴다.
 */
export function useInitialLocation({
  onResolve,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  enabled = true,
  lateCorrection = true,
  resetKey,
} = {}) {
  const { location, status, requestLocation } = useGeolocation();

  // onResolve가 매 렌더 새 함수로 와도 race를 재시작하지 않도록 ref로 최신값만 참조한다
  // (PetMap.jsx의 onMapMovedRef 등과 동일한 패턴).
  const onResolveRef = useRef(onResolve);
  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let settled = false; // 이미 "초기" 확정을 통보했는지 (3초 타이머 vs 위치 응답 중 먼저 온 쪽)
    let timedOut = false;

    const timer = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      timedOut = true;
      onResolveRef.current?.({ ...DEFAULT_CENTER }, { granted: false, late: false });
    }, timeoutMs);

    requestLocation().then((loc) => {
      if (cancelled) return;
      clearTimeout(timer);

      if (timedOut) {
        // 이미 기본 좌표로 초기 확정을 통보한 상태 — 위치가 뒤늦게 "허용"으로
        // 확정된 경우에만(lateCorrection이 켜져 있을 때) 한 번 더 통보한다.
        if (lateCorrection && loc) {
          onResolveRef.current?.(loc, { granted: true, late: true });
        }
        return;
      }

      if (settled) return; // 안전장치 — 이론상 도달하지 않음
      settled = true;
      const center = loc ?? DEFAULT_CENTER;
      onResolveRef.current?.(center, { granted: Boolean(loc), late: false });
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, timeoutMs, lateCorrection, requestLocation, resetKey]);

  return { location, status, requestLocation };
}
