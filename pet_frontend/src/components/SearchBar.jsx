/**
 * SearchBar — 프로젝트 공용 검색바 컴포넌트.
 *
 * 두 가지 동작 모드를 하나의 컴포넌트로 통합한다 (루트 CLAUDE.md
 * "Phase: 검색 통합 — AI 챗봇 검색" 기획 기준):
 *
 * 1) 리스트 필터 모드 (AI 토글 off, 기본값)
 *    - 타이핑 시 짧은 디바운스(기본 250ms) 후 `onFilter(query)` 호출.
 *    - 리스트 페이지가 클라이언트 사이드 필터링에 사용한다. AI 미개입 — 즉시·무료.
 *
 * 2) AI 검색 모드 (AI 토글 on)
 *    - 타이핑 중에는 `onFilter`/`onAiSearch` 모두 호출하지 않는다
 *      (AI 호출 비용·지연 통제). AI 토글을 켜는 순간, 필터 모드에서 예약돼
 *      있던 디바운스 타이머도 즉시 취소되어 전환 이후 `onFilter`가
 *      뒤늦게 발화하지 않는다.
 *    - Enter 또는 검색 버튼으로 "제출"할 때만 `onAiSearch(query)`를 호출한다.
 *    - 이 컴포넌트는 라우팅이나 API 호출을 하지 않는다. 제출 이후 동선
 *      (예: 챗봇 페이지 이동, `?q=` 쿼리 전달 등)은 사용처가 `onAiSearch`
 *      콜백 안에서 직접 결정한다.
 *
 * `onFilter` 인자 계약 (모든 호출 경로 공통):
 *   - 입력 필드의 **원문(raw, untrimmed)** 값을 그대로 전달한다. 앞뒤 공백
 *     제거(trim)나 빈 문자열 처리는 이 컴포넌트가 하지 않으며, **소비처
 *     책임**이다 (리스트별로 "공백만 입력 시 전체 목록 표시" 등 원하는
 *     정책이 다를 수 있기 때문).
 *   - 공백만 입력하거나(`"   "`) 완전히 비운 경우(`""`)에도 `onFilter`는
 *     동일하게 호출된다 — 값 판단은 소비처가 한다.
 *   - 호출 경로 3곳(타이핑 디바운스 / 제출 / AI→필터 모드 복귀) 모두 이
 *     정책을 따르므로 소비처는 인자 형태를 신경 쓰지 않고 하나의 처리
 *     함수만 두면 된다.
 *   - 반대로 `onAiSearch`는 AI 호출 비용 때문에 trim 후 빈 값이면 호출하지
 *     않는다 (아래 참고).
 *
 * `placeholder` 동작: AI 토글이 켜지면 사용처가 전달한 `placeholder`
 * 대신 고정 문구('AI에게 질문하기')를 표시한다 — 사용자가 현재 모드를
 * 텍스트로도 인지할 수 있게 하려는 의도적 동작이다. 모드별로 다른
 * placeholder가 필요하면 이 동작을 참고해 상위 컴포넌트에서 값을
 * 분기해 넘기기보다, 필요 시 향후 `aiPlaceholder` prop 분리를 검토한다.
 *
 * AI 토글 제어 방식 — 선택적 controlled/uncontrolled 패턴 (React 표준):
 *   - `aiEnabled`와 `onAiToggle`을 **둘 다** 넘기면 controlled로 동작한다.
 *     내부 state를 쓰지 않고 매 렌더마다 `aiEnabled` prop 값을 그대로
 *     표시하며, 토글을 누르면 `onAiToggle(next)`만 호출한다 — 실제 상태
 *     반영은 부모가 자신의 state를 갱신해야 이루어진다.
 *   - 둘 중 하나만 넘기거나 아예 넘기지 않으면 uncontrolled로 동작한다.
 *     `aiEnabled`는 마운트 시 초기값으로만 쓰이고(기본 false), 이후
 *     토글은 컴포넌트 내부 state가 자체적으로 관리한다.
 *
 * 사용 예시 — 리스트 필터 페이지 (uncontrolled, AI 없이):
 * ```jsx
 * <SearchBar
 *   placeholder="알림 검색"
 *   onFilter={(query) => setFilteredList(filterBy(query.trim()))}
 * />
 * ```
 *
 * 사용 예시 — AI 검색까지 지원하는 페이지 (uncontrolled 토글):
 * ```jsx
 * const navigate = useNavigate();
 *
 * <SearchBar
 *   placeholder="검색 또는 AI에게 질문하기"
 *   onFilter={(query) => setFilteredList(filterBy(query.trim()))}
 *   onAiSearch={(query) => navigate(`/chat?q=${encodeURIComponent(query)}`)}
 * />
 * ```
 *
 * 사용 예시 — 부모가 AI 토글 상태를 직접 제어(controlled)해야 하는 경우
 * (예: 챗봇 페이지에서 진입 시점에 AI 모드를 강제로 켜두고 싶을 때):
 * ```jsx
 * const [aiOn, setAiOn] = useState(true);
 *
 * <SearchBar
 *   placeholder="AI에게 질문하기"
 *   onFilter={(query) => setFilteredList(filterBy(query.trim()))}
 *   onAiSearch={(query) => runChatQuery(query)}
 *   aiEnabled={aiOn}
 *   onAiToggle={setAiOn}
 * />
 * ```
 *
 * Props
 * - placeholder?: string — input placeholder 텍스트 (AI 모드에서는 고정 문구로 대체됨, 위 설명 참고).
 * - onFilter?: (query: string) => void
 *     AI 토글이 off일 때 호출된다: 타이핑 시 디바운스 후, 제출 시,
 *     AI→필터 모드 복귀 시. 항상 원문(raw) 값을 전달한다(위 계약 참고).
 * - onAiSearch?: (query: string) => void
 *     AI 토글이 on일 때, 명시적 제출(Enter/버튼 클릭) 시에만 호출된다.
 *     trim 후 빈 문자열이면 호출하지 않는다.
 * - aiEnabled?: boolean — AI 토글 값. `onAiToggle`과 함께 주면 controlled,
 *     혼자 주면 초기값(uncontrolled). 기본 false.
 * - onAiToggle?: (enabled: boolean) => void — 토글 상태가 바뀔 때마다 호출.
 *     `aiEnabled`와 함께 주면 controlled 모드로 전환된다.
 * - debounceMs?: number — 필터 모드 디바운스 시간(ms). 기본 250.
 */

import { useEffect, useRef, useState } from 'react';
import './SearchBar.css';

function SearchBar({
  placeholder = '검색',
  onFilter,
  onAiSearch,
  aiEnabled,
  onAiToggle,
  debounceMs = 250,
}) {
  const [query, setQuery] = useState('');
  const isAiControlled = aiEnabled !== undefined && onAiToggle !== undefined;
  const [internalAiOn, setInternalAiOn] = useState(aiEnabled ?? false);
  const aiOn = isAiControlled ? aiEnabled : internalAiOn;
  const debounceRef = useRef(null);

  // 컴포넌트 언마운트 시 대기 중인 디바운스 타이머 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleChange = (event) => {
    const value = event.target.value;
    setQuery(value);

    // AI 모드에서는 타이핑만으로 onFilter/AI 호출을 하지 않는다 (명시적 제출 시에만 동작).
    if (aiOn) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onFilter?.(value);
    }, debounceMs);
  };

  const handleToggleAi = () => {
    // 필터 모드에서 예약돼 있던 디바운스 타이머를 먼저 취소한다.
    // 취소하지 않으면 AI 모드 전환 후 onFilter가 뒤늦게 발화해 모드 격리가 깨진다.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const next = !aiOn;
    if (!isAiControlled) {
      setInternalAiOn(next);
    }
    onAiToggle?.(next);

    // 필터 모드로 돌아갈 때, 이미 입력된 값(원문) 기준으로 즉시 필터를 한 번 반영한다.
    if (!next) {
      onFilter?.(query);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (aiOn) {
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      onAiSearch?.(trimmed);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onFilter?.(query);
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit} role="search">
      <button
        type="button"
        className={`search-bar__ai-toggle${aiOn ? ' search-bar__ai-toggle--on' : ''}`}
        onClick={handleToggleAi}
        aria-pressed={aiOn}
        title={aiOn ? 'AI 검색 켜짐' : 'AI 검색 꺼짐'}
      >
        AI
      </button>

      <input
        type="text"
        className="search-bar__input"
        placeholder={aiOn ? 'AI에게 질문하기' : placeholder}
        value={query}
        onChange={handleChange}
        aria-label="검색"
      />

      <button type="submit" className="search-bar__submit" aria-label="검색 실행">
        검색
      </button>
    </form>
  );
}

export default SearchBar;
