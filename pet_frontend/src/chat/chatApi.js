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
