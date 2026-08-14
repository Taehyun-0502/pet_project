/*
 * 영상 위/커버 위에 얹는 글자의 공통 상수.
 *
 * TextSheet에 두었다가 뺐다 — ThumbnailSheet·EditPage가 그 파일에서 상수만 가져다 쓰게 되어
 * "시트를 열려면 시트 파일을 import한다"는 이상한 의존이 생겼고, 컴포넌트 파일이 상수를 함께
 * 내보내면 개발 중 빠른 새로고침(fast refresh)도 깨진다.
 */

// 영상 위에 얹히는 글자라 길면 화면을 다 덮는다. 설명(caption 500자)과 역할이 달라 상한도 다르다
export const MAX_OVERLAY_TEXT = 100

// 서버(Shorts.MAX_OVERLAY_TEXTS · @Size)와 같은 값 — 한쪽만 올리면 400이 난다
export const MAX_OVERLAY_TEXTS = 5

/*
 * 고를 수 있는 글자 색. 서버는 목록을 강제하지 않고 #rrggbb 형식만 본다 —
 * 색은 취향이라 닫아 둘 이유가 없고, 닫으면 색 하나 더할 때마다 서버 배포가 필요해진다.
 * 흰검을 앞에 둔 이유: 영상 위 글자는 대부분 이 둘로 충분하고 나머지는 강조용이다.
 */
export const TEXT_COLORS = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00',
  '#34c759', '#32ade6', '#af52de', '#ff2d55',
]

// 색을 고르지 않았거나, 이 필드가 생기기 전에 저장된 글자가 쓰는 값 (서버 기본값과 같아야 한다)
export const DEFAULT_TEXT_COLOR = TEXT_COLORS[0]

/*
 * 글자 크기 **배율**. 픽셀이 아닌 이유는 좌표·색과 같다 — 보는 기기마다 프레임 크기가 달라
 * 픽셀로 저장하면 폰에서 맞춘 글자가 다른 화면에서 어긋난다.
 *
 * 1배 = 프레임 폭의 TEXT_BASE_RATIO(6%). **표시하는 네 곳이 모두 이 기준을 쓴다** —
 * 편집기(.sc-overlay-text) · 커버 시트(.sc-cover-text) · 피드(.sf-overlay-text)는 CSS의
 * 6cqw로, 커버 굽기는 bakeThumbnail.js의 THUMB_TEXT_RATIO로. 한 곳만 달라지면
 * "여기서 맞춘 글자가 저기서는 다른 크기"가 된다.
 *
 * 범위는 서버(ShortsOverlayText의 @DecimalMin/@DecimalMax)와 같은 값이다.
 */
export const TEXT_BASE_RATIO = 0.06
export const MIN_TEXT_SIZE = 0.5
export const MAX_TEXT_SIZE = 2.5
export const DEFAULT_TEXT_SIZE = 1
