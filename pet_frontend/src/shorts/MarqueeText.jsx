// 넘치는 한 줄 글자를 옆으로 흘려 보여준다 (곡 정보 표시 전용으로 만들었지만 내용은 가리지 않는다).
//
// 왜 ellipsis가 아니라 흐르게 하는가: 곡 표시는 "…"로 잘리면 정보가 사라진다.
// "Cute Baby Animals Playful Cute Woo…"는 제목도 아티스트도 알려주지 않는다.
// 영역 폭은 그대로 두고(넘어가면 레이아웃이 무너진다 — shortsUpload.css .su-music-pick strong 주석)
// 글자만 흘려서 끝까지 읽히게 한다.
//
// 넘치지 않으면 애니메이션을 걸지 않는다. 짧은 제목까지 흔들리면 읽기 힘들고, 화면에 카드가
// 여러 장 떠 있는 피드에서 쓸데없는 합성 작업만 는다.

import { useCallback, useEffect, useRef, useState } from 'react'
import './marquee.css'

// 흐르는 속도(px/초). 빠르면 못 읽고 느리면 한 바퀴가 지루하다
const SPEED_PX_PER_SEC = 38
// 한 바퀴가 이어지는 지점의 간격(px). 0이면 끝 글자와 첫 글자가 붙어 한 단어처럼 읽힌다
const GAP_PX = 32
// 넘침 판정 여유(px). 반올림으로 1px 넘쳤다고 흐르기 시작하면 멈춘 것도 흐르는 것도 아니게 보인다
const OVERFLOW_TOLERANCE_PX = 2
// 흐르기 전 멈춰 있는 시간(초). 뜨자마자 움직이면 앞부분을 놓친다
const START_DELAY_SEC = 1

/**
 * @param children  한 줄로 흐를 내용. 마크업을 넣어도 되지만 줄바꿈은 하지 않는다
 * @param className 바깥(뷰포트) 요소에 붙을 클래스 — 색·굵기 등은 여기서 준다
 */
export default function MarqueeText({ children, className = '' }) {
  // 폭이 제한되는 바깥 상자. 이 폭과 글자 폭을 비교해 흐를지 정한다
  const viewportRef = useRef(null)
  // 첫 번째 사본. 자연 폭(max-content)으로 놓이므로 이것이 "글자 전체 폭"이다
  const copyRef = useRef(null)
  // 한 바퀴에 움직일 거리(px). 0이면 넘치지 않는다는 뜻이고 애니메이션을 걸지 않는다
  const [distance, setDistance] = useState(0)

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    const copy = copyRef.current
    if (!viewport || !copy) return
    const overflow = copy.scrollWidth - viewport.clientWidth
    // 사본 폭 + 간격만큼 밀면 두 번째 사본이 첫 번째가 있던 자리에 정확히 온다 → 이음매가 없다
    setDistance(overflow > OVERFLOW_TOLERANCE_PX ? copy.scrollWidth + GAP_PX : 0)
  }, [])

  /*
   * 폭은 나중에 바뀐다 — 업로드 화면은 1단계(큰 미리보기)와 2단계(작은 미리보기)의 프레임 폭이
   * 다르고, 곡을 바꾸면 글자 폭이 바뀐다. 그래서 한 번 재고 마는 대신 두 요소를 관찰한다.
   *
   * 되먹임 걱정은 없다: 관찰 대상은 뷰포트와 **첫 사본**이고, 흐르기 시작해서 늘어나는 것은
   * 둘을 감싼 트랙(사본 2개 + 간격)이다. 트랙이 넓어져도 사본 폭은 그대로다.
   */
  useEffect(() => {
    measure()
    const viewport = viewportRef.current
    const copy = copyRef.current
    if (!viewport || !copy || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(copy)
    return () => observer.disconnect()
  }, [measure])

  const scrolling = distance > 0

  return (
    <span
      ref={viewportRef}
      className={scrolling ? `mq mq-on ${className}` : `mq ${className}`}
      style={
        scrolling
          ? {
              '--mq-distance': `${distance}px`,
              '--mq-gap': `${GAP_PX}px`,
              '--mq-duration': `${(distance / SPEED_PX_PER_SEC).toFixed(2)}s`,
              '--mq-delay': `${START_DELAY_SEC}s`,
            }
          : undefined
      }
    >
      <span className="mq-track">
        <span className="mq-copy" ref={copyRef}>
          {children}
        </span>
        {/* 이어 붙는 두 번째 사본. 같은 글자가 두 번 읽히지 않게 보조기기에서는 감춘다 */}
        {scrolling && (
          <span className="mq-copy" aria-hidden="true">
            {children}
          </span>
        )}
      </span>
    </span>
  )
}
