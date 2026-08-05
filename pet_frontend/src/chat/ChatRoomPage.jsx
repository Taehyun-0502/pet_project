import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import {
  changeMemberRole, delegateOwner, deleteRoom, getMessages, getRoomMembers,
  joinRoom, kickMember, leaveRoom, sendMessage,
} from './chatApi'
import './chat.css'

// 폴링 간격 — 2차에서 WebSocket으로 전환하면 이 상수와 setInterval이 사라진다
const POLL_INTERVAL_MS = 3000

// 방 내 role 표시명 (MEMBER는 배지 없음)
const ROLE_LABEL = { OWNER: '방장', MANAGER: '부방장' }

export default function ChatRoomPage() {
  const { roomId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const roomName = location.state?.roomName ?? '채팅방'
  const [messages, setMessages] = useState([])
  const [content, setContent] = useState('')
  const [pollError, setPollError] = useState('') // 일시 오류 — 다음 폴링에서 자동 재시도
  const [fatalError, setFatalError] = useState(null) // 폴링을 중단시킨 오류 (ApiError)
  const [sendError, setSendError] = useState('') // 전송 오류 — 폴링과 분리해 3초 뒤 사라지지 않게
  const [sending, setSending] = useState(false)
  const [retryKey, setRetryKey] = useState(0) // 입장 성공 후 폴링을 재시작하는 트리거
  const [members, setMembers] = useState(null) // 참여자 목록 — null = 아직 안 불러옴
  const [panelOpen, setPanelOpen] = useState(false) // 참여자 패널 표시 여부
  const [actionError, setActionError] = useState('') // 권한 동작(강퇴·위임 등) 오류
  const lastIdRef = useRef(null) // "폴링으로 확인한" 마지막 message id — afterId로 사용
  const listRef = useRef(null) // 스크롤 하단 고정용

  // 수신 메시지 병합 — id 기준 중복 제거 + 정렬.
  // lastIdRef는 여기서 건드리지 않는다 (전송 응답으로 전진시키면 메시지 유실 — docs/troubleshooting.md 1번)
  const mergeMessages = (incoming) => {
    if (incoming.length === 0) return
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id))
      const fresh = incoming.filter((m) => !known.has(m.id))
      if (fresh.length === 0) return prev
      return [...prev, ...fresh].sort((a, b) => a.id - b.id)
    })
  }

  // 초기 로드(최근 50개) + 3초 간격 폴링(afterId 이후만)
  useEffect(() => {
    let cancelled = false
    let timer = null

    // 방이 바뀌거나 입장 후 재시작할 때 이전 방의 상태가 남지 않게 초기화
    setMessages([])
    setFatalError(null)
    setPollError('')
    lastIdRef.current = null

    const fetchNew = async () => {
      try {
        const data = await getMessages(roomId, lastIdRef.current)
        if (cancelled) return
        if (data.length > 0) {
          // afterId 전진은 폴링 응답에서만 — 서버가 "여기까지 줬다"고 확인한 지점만 신뢰한다
          lastIdRef.current = Math.max(lastIdRef.current ?? 0, data[data.length - 1].id)
        }
        mergeMessages(data)
        setPollError('')
      } catch (err) {
        if (cancelled) return
        // 회복 불가능한 오류(미참여 403 / 토큰 만료 401 / 방 없음 404)는 폴링을 중단한다 —
        // 방치하면 3초마다 같은 실패를 영원히 반복한다 (docs/troubleshooting.md 2번)
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          clearInterval(timer)
          setFatalError(err)
        } else {
          setPollError(err.message)
        }
      }
    }

    fetchNew()
    timer = setInterval(fetchNew, POLL_INTERVAL_MS)
    // 정리(cleanup): 방을 나가면 타이머를 멈추고, 진행 중이던 응답도 무시한다
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [roomId, retryKey])

  // 새 메시지가 붙으면 스크롤을 맨 아래로
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // 참여자 목록 — 내 role 판단(버튼 노출)과 패널 표시에 사용. 실패는 치명적이지 않다
  const loadMembers = async () => {
    try {
      setMembers(await getRoomMembers(roomId))
    } catch {
      // 다음 권한 동작·재입장 때 다시 시도된다
    }
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, retryKey])

  const myRole = members?.find((m) => m.memberId === user.id)?.role

  // 권한 동작 공통 처리 — 성공하면 참여자 목록을 새로 읽는다 (role·인원 변화 반영)
  const runAction = async (action) => {
    setActionError('')
    try {
      await action()
      await loadMembers()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const onLeave = async () => {
    if (!window.confirm('이 방에서 나가시겠어요?')) return
    setActionError('')
    try {
      await leaveRoom(roomId)
      navigate('/chat')
    } catch (err) {
      setActionError(err.message) // 방장이면 409 — 위임 후에만 나갈 수 있다
    }
  }

  const onDeleteRoom = async () => {
    if (!window.confirm('방을 삭제하시겠어요? 되돌릴 수 없습니다.')) return
    setActionError('')
    try {
      await deleteRoom(roomId)
      navigate('/chat')
    } catch (err) {
      setActionError(err.message)
    }
  }

  const onKick = (target) => {
    if (!window.confirm(`${target.name}님을 강퇴할까요? 강퇴하면 이 방에 다시 입장할 수 없습니다.`)) return
    runAction(() => kickMember(roomId, target.memberId))
  }

  const onToggleManager = (target) => {
    const next = target.role === 'MANAGER' ? 'MEMBER' : 'MANAGER'
    runAction(() => changeMemberRole(roomId, target.memberId, next))
  }

  const onDelegate = (target) => {
    if (!window.confirm(`${target.name}님에게 방장을 위임할까요? 나는 일반 참여자가 됩니다.`)) return
    runAction(() => delegateOwner(roomId, target.memberId))
  }

  // 강퇴 버튼 노출 규칙 — 서버의 canKick과 동일 (OWNER는 MANAGER·MEMBER, MANAGER는 MEMBER만)
  const canKick = (target) =>
    target.memberId !== user.id &&
    ((myRole === 'OWNER' && target.role !== 'OWNER') ||
      (myRole === 'MANAGER' && target.role === 'MEMBER'))

  // 직접 URL로 들어와 미참여(403)로 멈춘 경우 — 입장(멱등) 후 폴링 재시작
  const onJoin = async () => {
    try {
      await joinRoom(roomId)
      setRetryKey((key) => key + 1)
    } catch (err) {
      setFatalError(err)
    }
  }

  const onSend = async (e) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setSending(true)
    try {
      const sent = await sendMessage(roomId, { content: trimmed })
      mergeMessages([sent]) // 화면 표시용으로만 병합 — lastIdRef는 전진시키지 않는다
      setContent('')
      setSendError('')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  // 폴링이 중단된 상태 — 원인 안내 (미참여면 입장 버튼 제공)
  if (fatalError) {
    return (
      <main className="chat-page">
        <header className="chat-header">
          <h1>{roomName}</h1>
          <Link to="/chat">← 방 목록으로</Link>
        </header>
        <p className="submit-error">{fatalError.message}</p>
        {fatalError.code === 'CHAT_NOT_PARTICIPANT' && (
          <button type="button" onClick={onJoin}>
            이 방에 입장하기
          </button>
        )}
      </main>
    )
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <h1>{roomName}</h1>
        <Link to="/chat">← 방 목록으로</Link>
      </header>

      <div className="chat-toolbar">
        <button
          type="button"
          onClick={() => {
            // 열 때마다 새로 읽는다 — 보고 있는 동안 입장·강퇴로 바뀐 목록 반영
            if (!panelOpen) loadMembers()
            setPanelOpen((open) => !open)
          }}
        >
          참여자{members ? ` ${members.length}` : ''}
        </button>
        <button type="button" onClick={onLeave}>나가기</button>
        {myRole === 'OWNER' && (
          <button type="button" className="danger" onClick={onDeleteRoom}>방 삭제</button>
        )}
      </div>

      {actionError && <p className="submit-error">{actionError}</p>}

      {panelOpen && members && (
        <ul className="chat-members">
          {members.map((m) => (
            <li key={m.memberId}>
              <span className="member-name">
                {m.name}
                {m.memberId === user.id && ' (나)'}
                {ROLE_LABEL[m.role] && <em className="role-badge">{ROLE_LABEL[m.role]}</em>}
              </span>
              <span className="member-actions">
                {myRole === 'OWNER' && m.memberId !== user.id && m.role !== 'OWNER' && (
                  <>
                    <button type="button" onClick={() => onToggleManager(m)}>
                      {m.role === 'MANAGER' ? '부방장 해제' : '부방장 지명'}
                    </button>
                    <button type="button" onClick={() => onDelegate(m)}>방장 위임</button>
                  </>
                )}
                {canKick(m) && (
                  <button type="button" className="danger" onClick={() => onKick(m)}>강퇴</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pollError && <p className="submit-error">{pollError}</p>}

      <ul className="chat-messages" ref={listRef}>
        {messages.map((message) => (
          <li key={message.id} className={message.senderId === user.id ? 'mine' : ''}>
            {message.senderId !== user.id && (
              <span className="sender">{message.senderName}</span>
            )}
            {message.content}
          </li>
        ))}
      </ul>

      {sendError && <p className="submit-error">{sendError}</p>}
      <form className="chat-send" onSubmit={onSend}>
        <input
          type="text" value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="메시지를 입력하세요 (1000자 이내)" maxLength={1000}
        />
        <button type="submit" disabled={sending}>
          전송
        </button>
      </form>
    </main>
  )
}
