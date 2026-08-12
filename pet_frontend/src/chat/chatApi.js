// 오픈채팅 API 호출 함수 모음 (docs/api-spec.md 7절과 1:1)

import { request } from '../common/apiClient'

// 성공 시 { id, name, category, description, participantCount, maxMembers, unreadCount, createdAt } 배열.
// 파라미터 전부 선택 (api-spec.md 7절 3차) — keyword: 이름+소개 부분 일치, category: ROOM_CATEGORIES 값,
// sort: 'recent'(기본)|'popular'. 없으면 전체·최신순
export function getRooms({ keyword, category, sort } = {}) {
  const params = new URLSearchParams()
  if (keyword) params.set('keyword', keyword)
  if (category) params.set('category', category)
  if (sort && sort !== 'recent') params.set('sort', sort)
  const query = params.toString()
  return request(`/api/chat/rooms${query ? `?${query}` : ''}`)
}

// category 필수(ROOM_CATEGORIES 값), description·maxMembers 선택(null 허용) — api-spec.md 7절 3차
export function createRoom({ name, category, description, maxMembers }) {
  return request('/api/chat/rooms', { method: 'POST', body: { name, category, description, maxMembers } })
}

// 방 정보 수정 — OWNER만. 생성과 같은 바디의 전체 교체(생략된 선택 항목은 지워진다)
export function updateRoom(roomId, { name, category, description, maxMembers }) {
  return request(`/api/chat/rooms/${roomId}`, {
    method: 'PUT',
    body: { name, category, description, maxMembers },
  })
}

// 이미 참여 중이어도 성공(멱등) — 방 진입 전 항상 호출해도 안전
export function joinRoom(roomId) {
  return request(`/api/chat/rooms/${roomId}/join`, { method: 'POST' })
}

// 파라미터 없음: 최근 50 / afterId: 이후 최대 500(복구 — 상한 도달 시 이어서 재호출) /
// beforeId: 과거 50 (위로 스크롤). 둘 다 지정은 400 (api-spec.md 7절 3차)
export function getMessages(roomId, afterId, beforeId) {
  const params = new URLSearchParams()
  if (afterId) params.set('afterId', afterId)
  if (beforeId) params.set('beforeId', beforeId)
  const query = params.toString()
  return request(`/api/chat/rooms/${roomId}/messages${query ? `?${query}` : ''}`)
}

export function sendMessage(roomId, { content }) {
  return request(`/api/chat/rooms/${roomId}/messages`, { method: 'POST', body: { content } })
}

// ── 공지 핀 (3차 — api-spec.md 7절) ──

// 공지 조회 (참여자만) — 핀 메시지(메시지 응답 형태), 없으면 null
export function getPinnedMessage(roomId) {
  return request(`/api/chat/rooms/${roomId}/pin`)
}

// 공지 고정(교체 겸용) — OWNER·MANAGER만. 다른 방 메시지는 404
export function pinMessage(roomId, messageId) {
  return request(`/api/chat/rooms/${roomId}/pin`, { method: 'PUT', body: { messageId } })
}

// 공지 해제 — 핀이 없어도 성공(멱등)
export function unpinMessage(roomId) {
  return request(`/api/chat/rooms/${roomId}/pin`, { method: 'DELETE' })
}

// ── 이하 2차: 권한 행사 기능 ──

// 참여자 목록 (참여자만) — [{ memberId, name, role }] , OWNER → MANAGER → MEMBER 순
// 읽음 위치 보고 — 멱등, 과거 값은 서버가 무시(단조 증가). 실패해도 다음 보고가 만회한다
export function markRead(roomId, lastReadMessageId) {
  return request(`/api/chat/rooms/${roomId}/read`, { method: 'PUT', body: { lastReadMessageId } })
}

export function getRoomMembers(roomId) {
  return request(`/api/chat/rooms/${roomId}/members`)
}

// 나가기 — OWNER는 위임 전에는 409 CHAT_OWNER_CANNOT_LEAVE
export function leaveRoom(roomId) {
  return request(`/api/chat/rooms/${roomId}/leave`, { method: 'POST' })
}

// 강퇴 — 강퇴된 회원은 재입장 불가
export function kickMember(roomId, memberId) {
  return request(`/api/chat/rooms/${roomId}/members/${memberId}/kick`, { method: 'POST' })
}

// MANAGER 지명(role='MANAGER')·해제(role='MEMBER') — OWNER만
export function changeMemberRole(roomId, memberId, role) {
  return request(`/api/chat/rooms/${roomId}/members/${memberId}/role`, { method: 'PATCH', body: { role } })
}

// 방장 위임 — 기존 방장은 MEMBER가 된다
export function delegateOwner(roomId, memberId) {
  return request(`/api/chat/rooms/${roomId}/delegate`, { method: 'POST', body: { memberId } })
}

// 방 삭제(소프트) — OWNER만
export function deleteRoom(roomId) {
  return request(`/api/chat/rooms/${roomId}`, { method: 'DELETE' })
}
