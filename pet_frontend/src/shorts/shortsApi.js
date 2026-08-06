// 숏츠 API 호출 함수 모음 (shorts_guide_1.md 4절과 1:1)

import { ApiError, getToken, request } from '../common/apiClient'
import { BACKEND_URL } from '../config'

/**
 * 파일 업로드만 공통 request()를 쓰지 않고 여기서 직접 fetch한다.
 *
 * request()는 본문을 항상 JSON으로 직렬화하고 Content-Type을 json으로 박기 때문에
 * FormData를 보낼 수 없다. 그런데 common/apiClient.js는 다른 파트와 함께 쓰는 파일이라
 * 고치지 않기로 해서, 숏츠 쪽에만 필요한 multipart 전송을 이 파일에 둔다.
 * 토큰 첨부와 ApiResponse 해석 방식은 request()와 동일하게 맞췄다.
 *
 * Content-Type을 직접 지정하지 않는 것이 중요하다 — 지정하면 브라우저가 붙이는
 * multipart 경계(boundary)가 빠져 서버가 본문을 파싱하지 못한다.
 */
async function postFormData(path, form) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers, body: form })
  } catch {
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0)
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new ApiError('INVALID_RESPONSE', '서버 응답을 해석할 수 없습니다.', response.status)
  }
  if (!payload.success) {
    throw new ApiError(payload.error.code, payload.error.message, response.status)
  }
  return payload.data
}

/**
 * 피드 목록. 로그인 없이도 호출 가능한 공개 조회다.
 *
 * 정렬은 **품질점수순**이다 (B단계 — 숏츠_추천알고리즘_구현가이드.md 4-a절).
 * 참여도(좋아요·댓글)가 높고 최근에 올라온 영상이 위로 온다. 아직 개인화는 아니라서
 * 누가 봐도 순서가 같고, 사람마다 달라지는 것은 C단계다.
 *
 * 다음 페이지를 커서가 아니라 `excludeIds`로 받는 이유: 점수 순서는 id 순서와 무관해서
 * "이 id보다 작은 것"이라는 커서가 성립하지 않는다. 대신 이미 받은 id를 빼고 다시 상위 N개를
 * 요청한다 (가이드 9절).
 *
 * 성공 시 { items, hasNext }
 *   items: [{ id, memberName, videoUrl, thumbnailUrl, caption, tags, durationSec,
 *             viewCount, likeCount, commentCount, createdAt, likedByMe }]  ← 점수 높은 순
 *   hasNext: excludeIds를 늘려 한 번 더 요청하면 더 받을 수 있는지
 *
 * @param excludeIds 지금까지 받은 id 배열. 생략하면 첫 페이지
 */
export function getShortsFeed({ limit, excludeIds } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', limit)
  // 서버는 ?excludeIds=3,4,5 와 ?excludeIds=3&excludeIds=4 를 모두 받는다.
  // 짧은 쪽(콤마)으로 보낸다 — 목록이 길어지면 URL 길이 차이가 커진다
  if (excludeIds?.length) params.set('excludeIds', excludeIds.join(','))

  const query = params.toString()
  return request(`/api/shorts${query ? `?${query}` : ''}`)
}

/**
 * 영상 파일을 백엔드에 보내고 저장된 공개 URL을 받는다. 인증 필요.
 *
 * 프론트에서 Storage로 직접 올리지 않는 이유: 그러려면 Storage 쓰기 키가 프론트에 있어야 하고,
 * 프론트 환경변수는 빌드 결과에 그대로 박혀 누구나 볼 수 있다. 쓰기 권한은 서버만 갖는다.
 * 파일명 생성·mp4 검증·용량 제한도 모두 서버가 한다.
 *
 * 성공 시 { videoUrl }
 */
export function uploadVideoFile(file) {
  const form = new FormData()
  form.append('file', file)
  return postFormData('/api/shorts/video', form)
}

/**
 * 업로드 등록. 인증 필요 — Storage 업로드가 끝난 뒤 그 URL만 백엔드에 저장한다.
 *
 * topics는 추천 알고리즘이 취향을 집계하는 재료다 (숏츠_태그_설계.md 1절).
 * **고정 목록 13종 안의 값이어야 한다** — 서버가 `ShortsTopic` enum으로 최종 검증하고,
 * 목록 밖 값이면 허용 목록을 담은 400을 돌려준다.
 *
 * 필드 이름이 tags가 아니라 topics인 이유: 최종 `shorts.tags`는 "주제 + (나중에) 자동 태그
 * (종류·품종·지역)"의 합집합이고, 클라이언트가 보내는 것은 그중 주제뿐이다 (설계 5절).
 */
export function createShorts({ videoUrl, thumbnailUrl, caption, topics, durationSec }) {
  return request('/api/shorts', {
    method: 'POST',
    body: { videoUrl, thumbnailUrl, caption, topics, durationSec },
  })
}

/**
 * 시청 이벤트 기록 (가이드 7절). 인증 필요 — 비로그인은 호출하지 않는다.
 *
 * <b>실패해도 조용히 넘어간다.</b> 통계 수집이 재생을 방해하거나 에러 문구를 띄우면 안 된다.
 * 그래서 호출한 쪽에서 await하거나 catch할 필요가 없다.
 *
 * 공통 request()를 쓰지 않는 이유는 keepalive가 필요하기 때문이다. 탭을 닫거나 다른 앱으로
 * 넘어가는 순간 마지막 시청 기록을 보내야 하는데, 일반 fetch는 문서가 사라지면 함께 취소된다.
 * common/apiClient.js는 다른 파트와 함께 쓰는 파일이라 고치지 않기로 해서(공용 파일 최소 수정),
 * 같은 파일의 postFormData와 같은 방식으로 여기에 따로 둔다.
 *
 * navigator.sendBeacon을 쓰지 않은 이유: 헤더를 붙일 수 없어 Authorization을 실을 수 없다.
 * 이 엔드포인트는 로그인 전용이므로 토큰 없이는 401이 된다.
 *
 * @param options.keepalive 페이지를 떠나는 중이면 true — 문서가 사라져도 요청이 살아남는다
 */
export function sendShortsEvent(shortId, { type, watchMs = null }, { keepalive = false } = {}) {
  const token = getToken()
  if (!token) return Promise.resolve(false)

  return fetch(`${BACKEND_URL}/api/shorts/${shortId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, watchMs }),
    keepalive,
  })
    .then((response) => response.ok)
    .catch(() => false)
}

/**
 * 영상 좋아요 토글. 인증 필요. 이미 눌렀으면 취소된다.
 * 성공 시 { liked, likeCount } — 갱신된 수를 서버가 알려주므로 화면이 직접 계산하지 않는다
 * (다른 사람이 누른 것과 어긋나지 않게).
 */
export function toggleShortLike(shortId) {
  return request(`/api/shorts/${shortId}/like`, { method: 'POST' })
}

/**
 * 댓글 목록. 공개 조회(비로그인 가능)이며, 비로그인이면 likedByMe가 모두 false다.
 * 성공 시 { items, totalCount }
 *   items: [{ id, memberName, content, likeCount, likedByMe, createdAt, replies: [...] }]
 *   대댓글은 items[].replies에 들어있고, 2단까지만이라 replies[].replies는 항상 빈 배열이다
 */
export function getComments(shortId) {
  return request(`/api/shorts/${shortId}/comments`)
}

// 댓글 작성. parentId를 주면 대댓글이 된다 (대댓글에 또 답글은 서버가 막는다). 인증 필요
export function createComment(shortId, { content, parentId = null }) {
  return request(`/api/shorts/${shortId}/comments`, {
    method: 'POST',
    body: { content, parentId },
  })
}

// 댓글 좋아요 토글. 인증 필요. 성공 시 { liked, likeCount }
export function toggleCommentLike(commentId) {
  return request(`/api/shorts/comments/${commentId}/like`, { method: 'POST' })
}
