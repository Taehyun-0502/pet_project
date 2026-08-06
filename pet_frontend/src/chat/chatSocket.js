// 채팅 실시간 수신 (STOMP over WebSocket) — docs/api-spec.md 7절
// 전송은 REST(chatApi.sendMessage)를 그대로 쓰고, 이 파일은 수신 전용이다.

import { Client } from '@stomp/stompjs'
import { getToken } from '../common/apiClient'
import { BACKEND_URL } from '../config'

// http://host → ws://host/ws (https면 wss)
function toSocketUrl() {
  return `${BACKEND_URL.replace(/^http/, 'ws')}/ws`
}

// 서버가 ERROR 프레임의 message에 실어 보내는 ErrorCode → 사용자 안내문
const ERROR_MESSAGE = {
  CHAT_NOT_PARTICIPANT: '참여하지 않은 채팅방입니다.',
  CHAT_KICKED: '강퇴된 채팅방에는 다시 입장할 수 없습니다.',
  CHAT_ROOM_NOT_FOUND: '채팅방을 찾을 수 없습니다.',
  AUTH_TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  AUTH_TOKEN_INVALID: '인증에 실패했습니다. 다시 로그인해 주세요.',
  FORBIDDEN: '접근 권한이 없습니다.',
}

/**
 * 방 토픽을 구독한다. 반환값의 close()로 정리한다.
 *
 * @param roomId            구독할 방
 * @param onMessage         새 메시지 1건 (서버 이벤트 봉투의 data)
 * @param onMembersChanged  참여자 구성이 바뀜 — 내용은 없고 "다시 읽어라" 신호다
 * @param onReady           연결·구독이 선 직후 — 여기서 놓친 메시지를 REST로 복구한다
 * @param onFatal           재시도해도 소용없는 오류 { code, message } — 연결을 접은 뒤 호출된다
 * @param onStatus          연결 상태 변화 (true=연결됨)
 */
export function subscribeRoom(roomId, { onMessage, onMembersChanged, onReady, onFatal, onStatus }) {
  const client = new Client({
    brokerURL: toSocketUrl(),
    // 끊기면 5초 뒤 자동 재연결 — 강퇴 시 서버가 끊는 경우도 여기로 들어온다
    reconnectDelay: 5000,
    // 재연결마다 토큰을 다시 읽는다 (연결 시점에 저장된 값을 그대로 쓰면 재로그인 후에도 옛 토큰을 보낸다)
    beforeConnect: () => {
      client.connectHeaders = { Authorization: `Bearer ${getToken()}` }
    },
    onConnect: () => {
      // 구독을 먼저 걸고 나서 복구한다 — 순서가 반대면 복구 조회와 구독 시작 사이의 메시지가 유실된다.
      // 겹쳐서 중복 수신되는 건 id 기준 중복 제거가 걸러준다
      client.subscribe(`/topic/chat/rooms/${roomId}`, (frame) => {
        let event
        try {
          event = JSON.parse(frame.body)
        } catch {
          return // 서버 이벤트 봉투가 아닌 본문은 무시 — 콜백 예외로 구독이 죽지 않게
        }
        if (event.type === 'MESSAGE') {
          onMessage(event.data)
        } else if (event.type === 'MEMBERS_CHANGED') {
          onMembersChanged()
        }
        // 알 수 없는 type은 무시 — 서버가 이벤트를 추가해도 화면이 깨지지 않는다
      })
      onStatus(true)
      onReady()
    },
    onWebSocketClose: () => onStatus(false),
    onStompError: (frame) => {
      // 서버가 프레임을 거부했다(인증 실패·미참여 등). 재시도해도 결과가 같으므로 연결을 접는다
      // — 방치하면 5초마다 같은 실패를 영원히 반복한다 (docs/troubleshooting.md 2번과 같은 함정)
      const code = frame.headers?.message ?? 'INTERNAL_ERROR'
      client.deactivate()
      onStatus(false)
      onFatal({ code, message: ERROR_MESSAGE[code] ?? '실시간 연결에 실패했습니다.' })
    },
  })

  client.activate()
  return { close: () => client.deactivate() }
}
