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
 * 영상 한 건 조회. 공유 링크(`/shorts?v=123`)로 들어온 경우에 쓴다.
 * 피드와 같이 공개 조회라 비로그인도 볼 수 있고, 그 경우 likedByMe는 false다.
 * 삭제됐거나 없는 영상이면 404 SHORTS_NOT_FOUND.
 */
export function getShort(shortId) {
  return request(`/api/shorts/${shortId}`)
}

/**
 * 영상 삭제. 인증 필요하고 **올린 사람만** 지울 수 있다.
 *
 * 소프트 삭제라 좋아요·댓글·시청 이력은 DB에 남는다(그 테이블들이 이 영상을 참조하므로
 * 물리 삭제하면 FK 위반이 난다). 영상 파일도 Storage에 남는다.
 *
 * 남의 영상을 지우려 하면 403이 아니라 **404**가 온다 — 403은 "그 영상은 있는데 네 것이 아니다"를
 * 알려주는 셈이라 id를 훑어 남의 영상 존재를 알아낼 수 있다.
 */
export function deleteShorts(shortId) {
  return request(`/api/shorts/${shortId}`, { method: 'DELETE' })
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
 * 커버(썸네일) 이미지를 올리고 저장된 공개 URL을 받는다. 인증 필요.
 *
 * 브라우저가 canvas로 구운 720×1280 jpeg를 보낸다(bakeThumbnail.js). 영상과 엔드포인트를
 * 나눈 이유는 허용 형식·크기 상한이 전혀 다르기 때문이다(jpeg 2MB vs 영상 50MB).
 *
 * **실패해도 발행을 막지 않는다.** 커버가 없으면 피드가 영상 첫 프레임을 쓰므로,
 * 호출한 쪽이 오류를 삼키고 thumbnailUrl 없이 등록하면 된다.
 *
 * 성공 시 { thumbnailUrl }
 */
export function uploadThumbnailFile(blob) {
  const form = new FormData()
  // 파일 이름을 주지 않으면 브라우저가 "blob"으로 보내 서버 로그에서 구분이 안 된다
  form.append('file', blob, 'cover.jpg')
  return postFormData('/api/shorts/thumbnail', form)
}

/**
 * 업로드 등록. 인증 필요 — Storage 업로드가 끝난 뒤 그 URL만 백엔드에 저장한다.
 *
 * topics는 추천 알고리즘이 취향을 집계하는 재료다 (숏츠_태그_설계.md 1절).
 * **고정 목록 13종 안의 값이어야 한다** — 서버가 `ShortsTopic` enum으로 최종 검증하고,
 * 목록 밖 값이면 허용 목록을 담은 400을 돌려준다.
 *
 * 필드 이름이 tags가 아니라 topics인 이유: 최종 `shorts.tags`는 "주제 + 자동 태그"의 합집합이고,
 * 클라이언트가 보내는 것은 그중 주제뿐이다 (설계 5절).
 *
 * petIds는 영상의 주인공 반려동물들이며 **선택 사항**이다(빈 배열 가능 — 반려동물이 없어도 올릴 수
 * 있다). 한 영상에 여러 마리를 고를 수 있고, 서버가 그 반려동물들의 **품종을 자동 태그로 tags에
 * 합쳐 넣는다** — 품종 문자열을 프론트가 직접 topics에 넣지 않는다. topics는 고정 목록 13종만
 * 허용이라 품종을 넣으면 400이 되고, 무엇보다 남의 반려동물 품종을 사칭해 보낼 수 있다.
 * 서버가 소유자를 확인한 뒤 붙이는 이유다 (하나라도 내 것이 아니면 404 PET_NOT_FOUND).
 *
 * musicKey는 배경음악이고 **선택 사항**이다(null이면 곡 없이 올린다). 값은 musicCatalog.js의
 * 66곡 중 하나의 key여야 하며, 서버가 `ShortsMusicKeys`로 최종 검증한다 — 임의 값이면 400이다.
 * URL이 아니라 key를 보내는 이유: URL을 받으면 클라이언트가 외부 주소를 넣을 수 있어
 * "저작권 없는 음원만 쓴다"는 전제가 무너진다.
 *
 * muteOriginal은 **영상 원본 소리를 끌지**다. 화면은 세 모드(영상 소리 그대로 / 음소거 /
 * 배경음악)로 고르게 하고 여기서 두 값으로 풀어 보낸다 — 배경음악을 고르면 원본은 자동으로
 * 꺼진다(muteOriginal=true). 보내지 않으면 서버가 false(원본 유지)로 본다.
 *
 * musicStartSec은 곡의 어느 지점부터 쓸지(초)다. 구간 길이는 영상 길이와 같아 따로 보내지 않는다.
 *
 * trimStartSec·trimEndSec은 **재생 구간**(초)이다. 영상 파일은 잘려 있지 않고 원본 그대로 올라가며,
 * 재생 쪽이 이 구간만 반복한다 (가이드 4절 방법 A — 음악 트리밍과 같은 방식). trimEndSec을
 * 보내지 않으면 원본 끝까지다. durationSec은 이 구간의 길이와 맞아야 한다.
 *
 * crop은 9:16 프레임 안 위치이며 `{ scale, offsetX, offsetY }`다. null이면 기본(가운데 cover)이고
 * 지금까지의 표시와 같다. offset은 픽셀이 아니라 **프레임 크기 기준 비율**이다 — 계산과 표시
 * 규칙은 cropFrame.js 한 곳에 있고 편집기와 피드가 그것을 함께 쓴다.
 *
 * overlayTexts는 **영상 화면 위에 얹는 글자들**이고 caption(영상 아래 설명)과 다른 값이다.
 * `[{ text, top, left }, ...]` 형태이며 최대 5개다(서버가 @Size로 막는다).
 * top/left는 0~100(%)이고 글자 블록의 **중심** 좌표다 — 픽셀로 보내면 보는 기기의 프레임
 * 크기가 달라 폰에서 맞춘 위치가 데스크톱에서 엉뚱한 곳에 뜬다.
 */
export function createShorts({
  petIds, videoUrl, thumbnailUrl, caption, topics, durationSec,
  musicKey, muteOriginal, musicStartSec, overlayTexts,
  trimStartSec, trimEndSec, crop, musicVolume, videoVolume,
  thumbnailTimeSec, thumbnailTextOverlays,
}) {
  return request('/api/shorts', {
    method: 'POST',
    body: {
      petIds, videoUrl, thumbnailUrl, caption, topics, durationSec,
      musicKey, muteOriginal, musicStartSec, overlayTexts,
      trimStartSec, trimEndSec, crop, musicVolume, videoVolume,
      thumbnailTimeSec, thumbnailTextOverlays,
    },
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
