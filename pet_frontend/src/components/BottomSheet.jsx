/**
 * BottomSheet — 하단 바텀시트 공용 크롬 (2026-08-26 QA L-3 우선순위 리팩토링,
 * 사용자 승인). 백드롭(클릭 닫기)·패널·접근성(`useSheetA11y`)·열림/닫힘 모션을
 * 하나로 묶는다. 순수 구조 리팩토링 — 5곳(PetMap 마커 상세 시트·MapPage AI 답변
 * 시트·MapPage 장소 목록 시트·NearbyPlaces 장소 목록 시트·WalkPage GPS 안내 팝업)에
 * 복붙돼 갈라져 있던 코드를 승격한 것으로, **각 시트의 기존 모션·시각 결과는
 * 그대로 유지**한다(접근성 통일만 허용된 예외 — useSheetA11y.js 참고).
 *
 * 리팩토링 전 5곳의 모션이 서로 달랐다는 사실 자체가 이 컴포넌트의 설계
 * 근거다 — 하나로 통일하지 않고 인스턴스별로 그대로 재현한다:
 * - PetMap 상세 시트 / MapPage AI 답변 시트: 모션 없음(즉시 마운트/언마운트).
 * - MapPage 장소 목록 시트 / NearbyPlaces 장소 목록 시트: 슬라이드업 340ms +
 *   배경 페이드, 닫을 때 역재생 후 (호출부가) 지연 언마운트.
 * - WalkPage GPS 안내 팝업: 슬라이드업 240ms(진입만) + 배경은 애니메이션 없음,
 *   닫을 때 즉시 언마운트(역재생 없음).
 *
 * 이 차이를 `enterMs`/`exitMs`/`backdropAnimated` 3개 prop으로 표현한다 —
 * `enterMs`가 0(기본값)이면 애니메이션 자체가 없고, 0보다 크면 그 값(ms)으로
 * 슬라이드 진입 애니메이션이 재생된다. `exitMs`(기본값 = enterMs)는 `closing`
 * prop이 true일 때의 퇴장 애니메이션 길이다. 넘긴 값은 CSS 커스텀 프로퍼티
 * (`--bottom-sheet-enter-ms`/`--bottom-sheet-exit-ms`)로 패널·백드롭에 인라인
 * 주입되어 BottomSheet.css의 애니메이션 duration이 그 값을 그대로 쓴다 — 즉
 * **모션 시간의 실제 단일 소스는 호출부가 넘기는 이 prop 값**이고, 페이지
 * CSS가 별도로 애니메이션 시간을 하드코딩해 "JS와 일치시켜야" 하는 과거
 * 방식(SHEET_MOTION_MS를 각 파일에 정의해두고 CSS 쪽에 "일치 필수" 주석만
 * 달아두던 것)의 불일치 위험이 사라진다. 다만 완전히 새 시트가 아니라 *기존
 * 값 재현*이 목적이라 호출부가 그 값(340/240)을 지역 상수로 들고 있다가
 * prop으로 넘긴다(예: MapPage.jsx의 `SHEET_MOTION_MS`, WalkPage.jsx의
 * `START_SHEET_ENTER_MS`).
 *
 * **열림/닫힘 상태는 이 컴포넌트가 소유하지 않는다** — 호출부가 여전히
 * `{condition && <BottomSheet>...</BottomSheet>}`로 마운트/언마운트를 직접
 * 제어한다(리팩토링 전과 동일한 패턴). `closing` prop은 "퇴장 애니메이션 클래스를
 * 입힐지"만 결정하고, 실제 언마운트 타이밍(퇴장 애니메이션 재생 시간만큼
 * 기다렸다가 마운트 상태를 false로 전환하는 것)은 호출부의 몫이다. MapPage의
 * 장소 목록 시트가 이 방식을 요구한다 — 시트 밖의 카테고리 토글 칩이 시트
 * 닫힘과 별도 타이밍(CHIP_FADE_MS)으로 페이드아웃되므로, 그 조율 로직(칩 포털
 * 이동 등)은 여전히 MapPage 소유여야 한다.
 *
 * `portal`이 true면 `document.body`로 포털한다 — PetMap이 `.pet-map`의
 * z-index:0 격리 스태킹 컨텍스트를 피하려고 쓰던 방식(2026-08-07 버그 수정)을
 * 그대로 유지하기 위한 옵션이다. 나머지 4곳은 포털 없이(false, 기본값) 페이지
 * 트리 안에서 `position: fixed`로만 화면에 고정된다(기존과 동일).
 *
 * 패널/백드롭의 구조적 공통 스타일(위치·정렬·360px 컬럼 제한·radius 등 —
 * 실측 결과 5곳이 이미 동일했던 값)은 BottomSheet.css의 `.bottom-sheet__*`
 * 기본 클래스가 담당하고, 패딩·최대 높이·배경 불투명도·테두리처럼 실제로
 * 값이 다른 부분은 호출부가 `panelClassName`/`backdropClassName`으로 자신의
 * 기존 페이지 클래스(`pet-map__sheet` 등)를 얹어 오버라이드한다 — 페이지 CSS
 * 파일은 그 차이 나는 속성만 남기고 공통 부분은 제거했다(제거 내역은 각 CSS
 * 파일 주석 참고).
 *
 * Props
 * - onClose?: () => void — ESC 키·백드롭 클릭 시 호출.
 * - closing?: boolean — true면 패널/백드롭에 퇴장 애니메이션 클래스를 추가한다
 *     (backdropAnimated가 true일 때만 백드롭에도 적용). 기본 false.
 * - ariaLabel? / ariaLabelledBy?: string — 패널의 접근 가능한 이름(dialog).
 * - panelClassName? / backdropClassName?: string — 페이지 고유 스타일 클래스.
 * - portal?: boolean — true면 `createPortal(document.body)`. 기본 false.
 * - enterMs?: number — 진입 애니메이션 길이(ms). 0(기본값)이면 애니메이션 없음.
 * - exitMs?: number — 퇴장 애니메이션 길이(ms). 기본값은 enterMs와 동일.
 * - backdropAnimated?: boolean — true면 백드롭도 페이드 인/아웃한다. 기본 false
 *     (WalkPage처럼 패널만 슬라이드하고 배경은 정적인 경우를 위한 옵션).
 * - children: 시트 내부 마크업(핸들·헤더·본문 등) — 페이지가 기존 그대로 전달한다.
 */

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSheetA11y } from '../hooks/useSheetA11y';
import './BottomSheet.css';

const cx = (...classes) => classes.filter(Boolean).join(' ');

function BottomSheet({
  onClose,
  closing = false,
  ariaLabel,
  ariaLabelledBy,
  panelClassName = '',
  backdropClassName = '',
  portal = false,
  enterMs = 0,
  exitMs = enterMs,
  backdropAnimated = false,
  children,
}) {
  const panelRef = useRef(null);

  // BottomSheet는 항상 "열려 있을 때만" 마운트되는 조건부 렌더링 패턴으로
  // 쓰인다(파일 상단 주석 참고) — 따라서 active는 항상 true로 고정해도
  // 마운트 시 1회 실행·언마운트 시 정리라는 원래 의도가 그대로 보존된다.
  useSheetA11y({ active: true, onClose, panelRef });

  const panelAnimated = enterMs > 0;
  const style =
    panelAnimated || backdropAnimated
      ? {
          '--bottom-sheet-enter-ms': `${enterMs}ms`,
          '--bottom-sheet-exit-ms': `${exitMs}ms`,
        }
      : undefined;

  const handleBackdropMouseDown = (event) => {
    // 배경(오버레이) 자체를 클릭했을 때만 닫는다 — 패널 내부 클릭은 패널 쪽
    // stopPropagation으로 여기까지 버블링되지 않는다 (기존 5곳 전부 동일 원칙).
    if (event.target === event.currentTarget) onClose?.();
  };

  const content = (
    <div
      className={cx(
        'bottom-sheet__backdrop',
        backdropAnimated && 'bottom-sheet__backdrop--animated',
        backdropAnimated && closing && 'bottom-sheet__backdrop--closing',
        backdropClassName,
      )}
      style={backdropAnimated ? style : undefined}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        className={cx(
          'bottom-sheet__panel',
          panelAnimated && 'bottom-sheet__panel--animated',
          panelAnimated && closing && 'bottom-sheet__panel--closing',
          panelClassName,
        )}
        style={panelAnimated ? style : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(content, document.body) : content;
}

export default BottomSheet;
