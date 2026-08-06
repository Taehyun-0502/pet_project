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
 * 성공 시 { items, nextCursor }
 *   items: [{ id, memberName, videoUrl, thumbnailUrl, caption, durationSec, viewCount, likeCount, createdAt }]
 *   nextCursor: 다음 페이지 요청에 넣을 id. null이면 마지막 페이지
 */
export function getShortsFeed({ cursor, limit } = {}) {
  const params = new URLSearchParams()
  if (cursor != null) params.set('cursor', cursor)
  if (limit != null) params.set('limit', limit)

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

// 업로드 등록. 인증 필요 — Storage 업로드가 끝난 뒤 그 URL만 백엔드에 저장한다
export function createShorts({ videoUrl, thumbnailUrl, caption, durationSec }) {
  return request('/api/shorts', {
    method: 'POST',
    body: { videoUrl, thumbnailUrl, caption, durationSec },
  })
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
