import { useEffect, useRef } from 'react';

/**
 * useSheetA11y — 바텀시트류(다이얼로그) 공통 접근성 로직 (2026-08-26 QA L-3
 * 우선순위 리팩토링). `components/BottomSheet.jsx`가 내부적으로 사용한다.
 *
 * 리팩토링 전에는 PetMap.jsx(마커 상세 시트)·MapPage.jsx(AI 답변·장소 목록
 * 시트 2벌)·NearbyPlaces.jsx(장소 목록 시트)·WalkPage.jsx(GPS 안내 팝업) 5곳에
 * 이 로직이 개별 `useEffect`로 복붙돼 있었고, 이미 갈라져 있었다 — Tab 트랩은
 * PetMap·WalkPage 2곳만 있었고, `aria-modal`도 2곳만 붙어 있었다. 이 훅으로
 * 승격하며 5곳 전부에 동일하게 적용한다(포커스 이동+복귀·Tab 트랩·ESC 닫기·
 * 배경 스크롤 잠금 — Tab 트랩은 없던 3곳에 새로 생기는 부분이며, `BottomSheet`가
 * `role="dialog"`+`aria-modal="true"`를 항상 부여해 그 3곳에도 새로 붙는다.
 * "리팩토링 전과 완전히 동일해야 한다" 원칙의 유일한 예외로 허용된 접근성 통일).
 *
 * @param {object} options
 * @param {boolean} options.active - 시트가 열려 있는지(마운트되어 표시 중인지).
 *   `BottomSheet`는 조건부 렌더링(`{open && <BottomSheet/>}`)으로 마운트되므로
 *   마운트돼 있는 동안은 항상 true — 이 훅의 effect는 마운트 시 1회 실행되고
 *   언마운트 시 정리된다.
 * @param {() => void} [options.onClose] - ESC 키 입력 시 호출된다. 매 렌더 새
 *   함수여도 무방하다(ref로 최신값만 참조 — effect 재실행/포커스 재이동을 유발하지 않음).
 * @param {React.RefObject<HTMLElement>} options.panelRef - 포커스 이동·Tab 트랩
 *   대상 패널(다이얼로그 루트) ref. `tabIndex={-1}`이 있어야 `.focus()`가 먹는다.
 */
export function useSheetA11y({ active, onClose, panelRef }) {
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose는 ref로 최신값 참조(재실행 방지)
  }, [active, panelRef]);
}
