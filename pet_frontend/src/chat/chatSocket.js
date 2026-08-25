// 채팅 실시간 수신 (STOMP over WebSocket) — docs/api-spec.md 7절
// 전송은 REST(chatApi.sendMessage)를 그대로 쓰고, 이 파일은 수신 전용이다.

import { Client } from '@stomp/stompjs'
import { getToken, refreshAccessToken } from '../common/apiClient'
import { BACKEND_URL } from '../config'

// http://host → ws://host/ws (https면 wss)
function toSocketUrl() {
  return `${BACKEND_URL.replace(/^http/, 'ws')}/ws`
}

/**
 * JWT 조각(base64url)을 디코딩한다 (리뷰 백로그 41번).
 *
 * `atob`는 표준 base64만 읽는데 JWT는 **base64url**이라 `-`·`_`가 섞이고 패딩(`=`)이 없다.
 * 지금은 클레임이 sub·role·iat·exp뿐이라 그 문자가 나오지 않아 **우연히** 동작하고 있었지만,
 * 클레임이 하나만 늘어도(한글 이름 등) 디코딩이 실패해 아래 catch로 떨어진다 —
 * 그러면 멀쩡한 토큰이 "만료"로 판정돼 **연결할 때마다 불필요한 재발급이 돌고**,
 * 회전이 잦아진 만큼 32번(재사용 오판) 노출도 커진다.
 */
function decodeBase64Url(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  // atob는 길이가 4의 배수가 아니면 거부할 수 있다 — 생략된 패딩을 되돌린다
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}

/**
 * 액세스 토큰이 만료됐거나 곧 만료되는지 — JWT의 exp를 그대로 읽는다(서명 검증은 서버 몫).
 * 만료 직전이면 만료로 친다: 연결이 서버에 닿는 사이에 넘어가버리면 그대로 거부당한다.
 *
 * 알려진 한계: 판정 기준이 **클라이언트 시계**다. 기기 시계가 15분 이상 틀어지면 만료를 놓쳐
 * troubleshooting 5번(만료 토큰으로 WS 재연결) 증상이 돌아올 수 있다. 서버가 준 `expiresIn`으로
 * 만료 시각을 저장하는 편이 정석이지만, 그러려면 토큰 저장 구조를 바꿔야 해 지금은 감수한다 (백로그 41번).
 */
function isExpiringSoon(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]))
    return payload.exp * 1000 <= Date.now() + 5000
  } catch {
    return true // 형식이 깨진 토큰 — 재발급을 시도하는 편이 낫다
  }
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
 * @param onPinChanged      공지 핀이 바뀜 — 같은 신호 방식, 받은 쪽이 GET /pin으로 다시 읽는다 (3차)
 * @param onRoomDeleted     방이 삭제됨 (백로그 25번) — 받은 쪽이 연결을 접고 안내를 띄운다
 * @param onReady           연결·구독이 선 직후 — 여기서 놓친 메시지를 REST로 복구한다
 * @param onFatal           재시도해도 소용없는 오류 { code, message } — 연결을 접은 뒤 호출된다
 * @param onStatus          연결 상태 변화 (true=연결됨)
 */
export function subscribeRoom(roomId, { onMessage, onMembersChanged, onPinChanged, onRoomDeleted, onReady, onFatal, onStatus }) {
  // 만료 때문에 재발급을 시도한 적이 있는지 — 새 토큰으로도 만료가 나오면 더 시도하지 않는다(무한 재연결 방지)
  let refreshed = false

  const client = new Client({
    brokerURL: toSocketUrl(),
    // 끊기면 5초 뒤 자동 재연결 — 강퇴 시 서버가 끊는 경우도 여기로 들어온다
    reconnectDelay: 5000,
    /**
     * 연결 직전마다 토큰을 다시 읽는다 (저장 시점의 값을 고정해두면 재로그인 후에도 옛 토큰을 보낸다).
     *
     * 만료됐으면 **연결하기 전에** 재발급받는다. 채팅방을 오래 열어둔 채 연결이 한 번 끊기면
     * 재연결은 만료된 토큰으로 CONNECT하게 되는데, 서버가 이를 거부하면 멀쩡히 로그인한 사용자가
     * 재로그인 화면을 보게 된다 — 거부당한 뒤 수습하는 것보다 아예 만료 토큰을 보내지 않는 편이 확실하다.
     */
    beforeConnect: async () => {
      let token = getToken()
      if (isExpiringSoon(token)) {
        try {
          token = await refreshAccessToken()
        } catch {
          // 리프레시 토큰까지 죽은 경우 — 만료된 토큰으로 연결을 시도하고,
          // 서버가 거부하면 아래 onStompError가 재로그인 안내를 띄운다
        }
      }
      client.connectHeaders = { Authorization: `Bearer ${token}` }
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
        } else if (event.type === 'PIN_CHANGED') {
          onPinChanged?.()
        } else if (event.type === 'ROOM_DELETED') {
          onRoomDeleted?.()
        }
        // 알 수 없는 type은 무시 — 서버가 이벤트를 추가해도 화면이 깨지지 않는다
      })
      onStatus(true)
      onReady()
    },
    onWebSocketClose: () => onStatus(false),
    onStompError: (frame) => {
      const code = frame.headers?.message ?? 'INTERNAL_ERROR'

      /*
       * 만료는 beforeConnect가 미리 막지만, 그 사이 토큰이 넘어가는 등으로 새어 나올 수 있다.
       * 한 번은 자동 재연결에 맡긴다 — beforeConnect가 다시 돌면서 재발급을 시도한다.
       * (두 번째부터는 아래로 떨어져 재로그인 안내. 무한 재연결 방지)
       */
      if (code === 'AUTH_TOKEN_EXPIRED' && !refreshed) {
        refreshed = true
        onStatus(false)
        return
      }

      // 그 밖의 거부(미참여·권한 없음 등)는 재시도해도 결과가 같으므로 연결을 접는다
      // — 방치하면 5초마다 같은 실패를 영원히 반복한다 (docs/troubleshooting.md 2번과 같은 함정)
      client.deactivate()
      onStatus(false)
      onFatal({ code, message: ERROR_MESSAGE[code] ?? '실시간 연결에 실패했습니다.' })
    },
  })

  client.activate()
  return { close: () => client.deactivate() }
}
