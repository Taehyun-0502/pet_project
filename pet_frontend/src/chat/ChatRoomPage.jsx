import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import {
  changeMemberRole, delegateOwner, deleteRoom, getMessages, getRoomMembers,
  joinRoom, kickMember, leaveRoom, markRead, sendMessage, updateRoom,
} from './chatApi'
import { subscribeRoom } from './chatSocket'
import { ROOM_CATEGORIES, categoryLabel } from './roomCategories'
import './chat.css'

// 방 내 role 표시명 (MEMBER는 배지 없음)
const ROLE_LABEL = { OWNER: '방장', MANAGER: '부방장' }

export default function ChatRoomPage() {
  const { roomId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  // 방 객체 — 목록·생성에서 넘어올 때 state로 받는다 (3차 — 방 프로필 표시·수정용).
  // 직접 URL 진입은 null: 프로필 표시·수정 없이 대화만 가능하다 (방 단건 조회 API는 아직 없음)
  const [room, setRoom] = useState(location.state?.room ?? null)
  const roomName = room?.name ?? location.state?.roomName ?? '채팅방'
  const [messages, setMessages] = useState([])
  const [content, setContent] = useState('')
  const [connected, setConnected] = useState(false) // 실시간 연결 상태 (끊기면 자동 재연결 중)
  const [fatalError, setFatalError] = useState(null) // 연결을 접게 만든 오류 ({ code, message })
  const [sendError, setSendError] = useState('') // 전송 오류 — 따로 두어 다른 알림에 지워지지 않게
  const [sending, setSending] = useState(false)
  const [retryKey, setRetryKey] = useState(0) // 입장 성공 후 재연결하는 트리거
  const [members, setMembers] = useState(null) // 참여자 목록 — null = 아직 안 불러옴
  const [panelOpen, setPanelOpen] = useState(false) // 참여자 패널 표시 여부
  const [actionError, setActionError] = useState('') // 권한 동작(강퇴·위임 등) 오류
  const lastIdRef = useRef(null) // 서버에게 확인받은 마지막 message id — 재연결 복구의 afterId
  const listRef = useRef(null) // 스크롤 하단 고정용
  const reportedIdRef = useRef(0) // 읽음 보고를 마친 마지막 message id (docs/api-spec.md 7절)

  // 화면에 표시된 메시지를 읽음으로 보고 — 1초 디바운스로 남발을 막는다.
  // 실패는 삼킨다: 멱등이라 다음 수신·재입장 때의 보고가 만회한다
  useEffect(() => {
    if (messages.length === 0) return undefined
    const lastId = messages[messages.length - 1].id
    if (lastId <= reportedIdRef.current) return undefined
    const timer = setTimeout(() => {
      reportedIdRef.current = lastId
      markRead(roomId, lastId).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [messages, roomId])

  // 방을 떠날 때 디바운스 대기 중이던 보고를 마저 보낸다 — 안 보내면 방금 본 메시지가 배지로 남는다
  useEffect(() => () => {
    const lastId = lastIdRef.current
    if (lastId && lastId > reportedIdRef.current) {
      markRead(roomId, lastId).catch(() => {})
    }
  }, [roomId])

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

  // afterId 전진 — 서버가 직접 내려준(조회 응답·서버 푸시) 지점만 신뢰한다
  const advanceLastId = (incoming) => {
    const max = Math.max(...incoming.map((m) => m.id))
    lastIdRef.current = Math.max(lastIdRef.current ?? 0, max)
  }

  // 초기 로드(최근 50개) + 실시간 구독. 폴링은 없다 — 새 메시지는 서버가 밀어준다
  useEffect(() => {
    let cancelled = false

    // 방이 바뀌거나 입장 후 재시작할 때 이전 방의 상태가 남지 않게 초기화
    setMessages([])
    setFatalError(null)
    setConnected(false)
    lastIdRef.current = null
    reportedIdRef.current = 0

    // afterId 이후를 받아 병합한다. 첫 로드(afterId 없음 = 최근 50개)와
    // 재연결 복구가 같은 경로를 쓴다 (docs/api-spec.md 7절)
    const loadSince = async () => {
      try {
        const data = await getMessages(roomId, lastIdRef.current)
        if (cancelled || data.length === 0) return
        advanceLastId(data)
        mergeMessages(data)
      } catch (err) {
        if (cancelled) return
        // 회복 불가능한 오류(미참여 403 / 토큰 만료 401 / 방 없음 404)만 화면을 멈춘다.
        // 네트워크 오류는 다음 재연결의 복구 조회가 다시 시도한다
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          setFatalError(err)
        }
      }
    }

    // 소켓이 늦게 붙거나 못 붙어도 대화 내용은 보이도록 먼저 한 번 읽는다
    loadSince()

    const socket = subscribeRoom(roomId, {
      onMessage: (message) => {
        if (cancelled) return
        // 서버가 커밋 후 밀어준 메시지라 여기서 afterId를 전진시켜도 안전하다
        // (커밋 전 push였다면 아직 커밋되지 않은 작은 id를 건너뛸 수 있다 — docs/troubleshooting.md 3번)
        advanceLastId([message])
        mergeMessages([message])
      },
      // 참여자 구성 변경 신호 — 내용이 없으므로 목록을 서버에서 다시 읽는다
      onMembersChanged: () => { if (!cancelled) loadMembers() },
      onReady: loadSince, // 연결·재연결 직후 놓친 구간 복구
      onFatal: (err) => { if (!cancelled) setFatalError(err) },
      onStatus: (ok) => { if (!cancelled) setConnected(ok) },
    })

    // 정리(cleanup): 방을 나가면 연결을 닫고, 진행 중이던 응답도 무시한다
    return () => {
      cancelled = true
      socket.close()
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

  // 권한 동작 공통 처리 — 성공하면 참여자 목록을 새로 읽는다.
  // 서버도 MEMBERS_CHANGED를 밀어주지만, 연결이 끊긴 상태에서도 내 화면은 즉시 맞도록 여기서도 읽는다
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

  // 직접 URL로 들어와 미참여(403)로 멈춘 경우 — 입장(멱등) 후 재연결
  const onJoin = async () => {
    try {
      const joined = await joinRoom(roomId) // 정원이 가득 찼으면 409 CHAT_ROOM_FULL
      setRoom(joined)
      setFatalError(null)
      setRetryKey((key) => key + 1)
    } catch (err) {
      setFatalError(err)
    }
  }

  // 방 정보 수정 (OWNER만, 3차 — docs/api-spec.md 7절). 생성과 같은 규칙의 전체 교체
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [savingRoom, setSavingRoom] = useState(false)

  const openEdit = () => {
    setEditForm({
      name: room.name,
      category: room.category,
      description: room.description ?? '',
      maxMembers: room.maxMembers ?? '',
    })
    setEditOpen(true)
  }

  const onEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value })

  const onSaveRoom = async (e) => {
    e.preventDefault()
    setActionError('')
    const name = editForm.name.trim()
    if (!name) {
      setActionError('방 이름을 입력해 주세요.')
      return
    }
    const maxMembers = editForm.maxMembers === '' ? null : Number(editForm.maxMembers)
    if (maxMembers !== null && (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 100)) {
      setActionError('정원은 2~100명 사이여야 합니다.')
      return
    }
    setSavingRoom(true)
    try {
      const updated = await updateRoom(roomId, {
        name,
        category: editForm.category,
        description: editForm.description.trim() || null,
        maxMembers,
      })
      setRoom(updated)
      setEditOpen(false)
    } catch (err) {
      setActionError(err.message) // OWNER 아님 403, 검증 400 등 — 서버 메시지 그대로
    } finally {
      setSavingRoom(false)
    }
  }

  const onSend = async (e) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setSending(true)
    try {
      const sent = await sendMessage(roomId, { content: trimmed })
      // 화면에 즉시 띄우기 위한 병합일 뿐 — lastIdRef는 전진시키지 않는다.
      // (같은 메시지가 곧 구독으로도 도착하고, 그때 중복 제거가 걸러낸다)
      mergeMessages([sent])
      setContent('')
      setSendError('')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  // 실시간 연결을 접은 상태 — 원인 안내 (미참여면 입장 버튼 제공)
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

      {/* 방 프로필 (3차) — 직접 URL 진입(room 없음)이면 표시하지 않는다 */}
      {room && (
        <div className="room-profile">
          <span className="room-category">{categoryLabel(room.category)}</span>
          {room.maxMembers && <span className="room-capacity">정원 {room.maxMembers}명</span>}
          {room.description && <span className="room-desc">{room.description}</span>}
        </div>
      )}

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
        {myRole === 'OWNER' && room && (
          <button type="button" onClick={() => (editOpen ? setEditOpen(false) : openEdit())}>
            방 정보 수정
          </button>
        )}
        {myRole === 'OWNER' && (
          <button type="button" className="danger" onClick={onDeleteRoom}>방 삭제</button>
        )}
      </div>

      {actionError && <p className="submit-error">{actionError}</p>}

      {editOpen && editForm && (
        <form className="room-edit" onSubmit={onSaveRoom}>
          <input
            type="text" name="name" value={editForm.name} onChange={onEditChange}
            placeholder="방 이름" maxLength={100}
          />
          <div className="chat-create-row">
            <select name="category" value={editForm.category} onChange={onEditChange} aria-label="카테고리">
              {ROOM_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="number" name="maxMembers" value={editForm.maxMembers} onChange={onEditChange}
              placeholder="정원 (선택)" min={2} max={100}
            />
          </div>
          <input
            type="text" name="description" value={editForm.description} onChange={onEditChange}
            placeholder="소개 (선택, 200자 이내)" maxLength={200}
          />
          <div className="room-edit-actions">
            <button type="submit" disabled={savingRoom}>{savingRoom ? '저장 중…' : '저장'}</button>
            <button type="button" disabled={savingRoom} onClick={() => setEditOpen(false)}>취소</button>
          </div>
        </form>
      )}

      {panelOpen && members && (
        <ul className="chat-members">
          {members.map((m) => (
            <li key={m.memberId}>
              <span className="member-name">
                {m.profileImageUrl ? (
                  <img className="avatar" src={m.profileImageUrl} alt="" />
                ) : (
                  <span className="avatar avatar-empty" aria-hidden="true">👤</span>
                )}
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

      {!connected && <p className="chat-status">실시간 연결 중…</p>}

      <ul className="chat-messages" ref={listRef}>
        {messages.map((message) => (
          <li key={message.id} className={message.senderId === user.id ? 'mine' : ''}>
            {message.senderId !== user.id && (
              <span className="sender">
                {message.senderProfileImageUrl ? (
                  <img className="avatar" src={message.senderProfileImageUrl} alt="" />
                ) : (
                  <span className="avatar avatar-empty" aria-hidden="true">👤</span>
                )}
                {message.senderName}
              </span>
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
