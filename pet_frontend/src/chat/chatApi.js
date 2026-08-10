// 오픈채팅 API 호출 함수 모음 (docs/api-spec.md 7절과 1:1)

import { request } from '../common/apiClient'

// 성공 시 { id, name, participantCount, createdAt } 배열
export function getRooms() {
  return request('/api/chat/rooms')
}

export function createRoom({ name }) {
  return request('/api/chat/rooms', { method: 'POST', body: { name } })
}

// 이미 참여 중이어도 성공(멱등) — 방 진입 전 항상 호출해도 안전
export function joinRoom(roomId) {
  return request(`/api/chat/rooms/${roomId}/join`, { method: 'POST' })
}

// afterId 생략: 최근 50개 / 지정: 그 이후 전부 (폴링용)
export function getMessages(roomId, afterId) {
  const query = afterId ? `?afterId=${afterId}` : ''
  return request(`/api/chat/rooms/${roomId}/messages${query}`)
}

export function sendMessage(roomId, { content }) {
  return request(`/api/chat/rooms/${roomId}/messages`, { method: 'POST', body: { content } })
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
