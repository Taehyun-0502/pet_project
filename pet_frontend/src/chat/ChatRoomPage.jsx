import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import { getMessages, joinRoom, sendMessage } from './chatApi'
import './chat.css'

// 폴링 간격 — 2차에서 WebSocket으로 전환하면 이 상수와 setInterval이 사라진다
const POLL_INTERVAL_MS = 3000

export default function ChatRoomPage() {
  const { roomId } = useParams()
  const location = useLocation()
  const { user } = useAuth()

  const roomName = location.state?.roomName ?? '채팅방'
  const [messages, setMessages] = useState([])
  const [content, setContent] = useState('')
  const [pollError, setPollError] = useState('') // 일시 오류 — 다음 폴링에서 자동 재시도
  const [fatalError, setFatalError] = useState(null) // 폴링을 중단시킨 오류 (ApiError)
  const [sendError, setSendError] = useState('') // 전송 오류 — 폴링과 분리해 3초 뒤 사라지지 않게
  const [sending, setSending] = useState(false)
  const [retryKey, setRetryKey] = useState(0) // 입장 성공 후 폴링을 재시작하는 트리거
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
