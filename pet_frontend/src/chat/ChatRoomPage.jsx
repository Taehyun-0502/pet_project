import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { useAuth } from '../member/AuthContext'
import {
  changeMemberRole, delegateOwner, deleteRoom, getMessages, getPinnedMessage, getRoomMembers,
  joinRoom, kickMember, leaveRoom, markRead, pinMessage, sendImageMessage, sendMessage,
  unpinMessage, updateRoom,
} from './chatApi'
import { subscribeRoom } from './chatSocket'
import { linkify } from './linkify'
import { ROOM_CATEGORIES, categoryLabel } from './roomCategories'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
import './chat.css'

// 방 내 role 표시명 (MEMBER는 배지 없음)
const ROLE_LABEL = { OWNER: '방장', MANAGER: '부방장' }

// 서버 계약과 짝 (api-spec.md 7절 3차) — 초기·과거 로드 페이지 크기 / afterId 복구 상한
const PAGE_SIZE = 50
const RECOVERY_LIMIT = 500

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
  const [sendingImage, setSendingImage] = useState(false) // 사진 전송 중 (F10b)
  const [retryKey, setRetryKey] = useState(0) // 입장 성공 후 재연결하는 트리거
  const [members, setMembers] = useState(null) // 참여자 목록 — null = 아직 안 불러옴
  const [pinned, setPinned] = useState(null) // 공지 핀 메시지 — null = 없음 (3차)
  const [panelOpen, setPanelOpen] = useState(false) // 참여자 패널 표시 여부
  const [actionError, setActionError] = useState('') // 권한 동작(강퇴·위임 등) 오류
  const lastIdRef = useRef(null) // 서버에게 확인받은 마지막 message id — 재연결 복구의 afterId
  const listRef = useRef(null) // 스크롤 하단 고정용
  const reportedIdRef = useRef(0) // 읽음 보고를 마친 마지막 message id (docs/api-spec.md 7절)
  // 과거 페이지네이션 (3차 — api-spec.md 7절)
  const [hasMore, setHasMore] = useState(true) // 이전 대화가 더 있는가 — 응답 < PAGE_SIZE면 끝
  const [loadingOlder, setLoadingOlder] = useState(false) // 과거 로드 중 (중복 요청 가드 겸 표시)
  // 하단 고정 여부 — 하단 근처에 있거나 내가 방금 보냈을 때만 자동 스크롤한다 (백로그 18번).
  // 과거를 읽는 중에 새 메시지가 와도 화면을 끌고 가지 않는다
  const stickBottomRef = useRef(true)
  const prependRef = useRef(null) // 과거 로드 직후 스크롤 보정용 { prevHeight, prevTop }

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
    setHasMore(true)
    setLoadingOlder(false)
    lastIdRef.current = null
    reportedIdRef.current = 0
    stickBottomRef.current = true
    prependRef.current = null

    // afterId 이후를 받아 병합한다. 첫 로드(afterId 없음 = 최근 50개)와
    // 재연결 복구가 같은 경로를 쓴다 (docs/api-spec.md 7절)
    //
    // **이어받기는 지역 커서(cursor)로 돈다** (리뷰 백로그 112번). 전역 lastIdRef를 매 회차 다시 읽으면,
    // 그 사이 도착한 WS 푸시가 같은 ref를 최신 id로 밀어 올려 **조회하지 않은 구간이 통째로 건너뛰어진다**
    // (커서 100 → 복구가 101~600 반환 → 그때 WS로 5000 도착 → 이어받기가 afterId=5000을 물어
    //  601~4999가 조회되지 않는다). lastIdRef는 max로만 합류하므로(advanceLastId) 이 지역 커서가
    // WS가 앞서 놓은 값을 되돌리는 일도 없다.
    const loadSince = async () => {
      try {
        let cursor = lastIdRef.current
        const initial = cursor === null
        // 재귀가 아니라 루프인 이유: onReady 콜백에 그대로 넘기는 함수라(인자를 받으면 커서로 오인된다)
        // 이어받기 상태를 파라미터가 아닌 지역 변수로 들고 있어야 한다
        for (;;) {
          const data = await getMessages(roomId, cursor)
          if (cancelled) return
          // 첫 로드가 한 페이지 미만이면 이 방의 대화 전체를 이미 다 받았다 — 과거 로드 불필요
          if (initial && data.length < PAGE_SIZE) setHasMore(false)
          if (data.length === 0) return
          cursor = Math.max(...data.map((m) => m.id))
          advanceLastId(data)
          mergeMessages(data)
          // 복구가 상한(500)에 걸렸으면 아직 밀린 메시지가 있다 — 마지막 id로 이어받는다 (7절 3차)
          if (initial || data.length < RECOVERY_LIMIT) return
        }
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
      // 공지 핀 변경 신호 — 같은 방식으로 다시 읽는다 (3차)
      onPinChanged: () => { if (!cancelled) loadPinned() },
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

  // 메시지 변경 후 스크롤 처리 (백로그 18번 개선 — 3차)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (prependRef.current) {
      // 과거 로드(prepend) — 늘어난 높이만큼 내려서 보던 위치를 유지한다 (안 하면 화면이 점프)
      el.scrollTop = el.scrollHeight - prependRef.current.prevHeight + prependRef.current.prevTop
      prependRef.current = null
      return
    }
    // 하단 근처였거나 내가 방금 보냈을 때만 맨 아래로 — 과거를 읽는 중엔 화면을 끌고 가지 않는다
    if (stickBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  // 과거 메시지 로드 — 화면에 있는 가장 오래된 id보다 이전 50개 (api-spec.md 7절 3차).
  // lastIdRef(afterId 복구 기준)는 여기서 절대 전진시키지 않는다 — 과거 응답이다 (troubleshooting 1번 규율)
  const loadOlder = async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const data = await getMessages(roomId, null, messages[0].id)
      const el = listRef.current
      prependRef.current = el ? { prevHeight: el.scrollHeight, prevTop: el.scrollTop } : null
      if (data.length < PAGE_SIZE) setHasMore(false)
      mergeMessages(data)
    } catch {
      // 다음 상단 스크롤에서 다시 시도된다 — 과거 로드 실패는 치명적이지 않다
    } finally {
      setLoadingOlder(false)
    }
  }

  // 스크롤 위치 추적 — 하단 고정 여부 갱신 + 상단 도달 시 과거 로드
  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 40) loadOlder()
  }

  // 참여자 목록 — 내 role 판단(버튼 노출)과 패널 표시에 사용. 실패는 치명적이지 않다
  const loadMembers = async () => {
    try {
      setMembers(await getRoomMembers(roomId))
    } catch {
      // 다음 권한 동작·재입장 때 다시 시도된다
    }
  }

  // 공지 핀 — 입장 시 1회 + PIN_CHANGED 신호마다. 실패는 다음 신호·재입장이 만회한다 (3차)
  const loadPinned = async () => {
    try {
      setPinned(await getPinnedMessage(roomId))
    } catch {
      // 미참여(403) 등 — 방 본문 쪽 fatalError 처리에 맡긴다
    }
  }

  useEffect(() => {
    setPinned(null) // 방 전환 시 이전 방의 공지가 남지 않게
    loadMembers()
    loadPinned()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, retryKey])

  const myRole = members?.find((m) => m.memberId === user.id)?.role
  // 공지 고정·해제 권한 — 서버 requireOwnerOrManager와 동일 기준 (버튼 노출은 중복 방어일 뿐)
  const canPin = myRole === 'OWNER' || myRole === 'MANAGER'

  const onPin = async (messageId) => {
    setActionError('')
    try {
      await pinMessage(roomId, messageId)
      await loadPinned() // PIN_CHANGED 신호도 오지만 연결이 끊긴 상태에서도 내 화면은 즉시 맞춘다
    } catch (err) {
      setActionError(err.message)
    }
  }

  const onUnpin = async () => {
    setActionError('')
    try {
      await unpinMessage(roomId)
      setPinned(null)
    } catch (err) {
      setActionError(err.message)
    }
  }

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

  /**
   * 이미지 전송 (F10b). 텍스트 전송과 같은 흐름이라 스크롤 규칙(stickBottomRef)도 그대로 따른다.
   * 고르는 즉시 전송한다 — v1은 **이미지 단독 메시지**라 캡션을 입력할 단계가 없다 (2026-08-13 확정).
   */
  const onImageChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setSendError('')
    setSendingImage(true)
    stickBottomRef.current = true // 텍스트 전송과 같은 이유 — onSend 주석 참조
    try {
      // 형식·용량 검증 + 512px 축소 (프로필·펫 사진과 같은 규칙). 원본은 보존하지 않는다
      const prepared = await prepareImage(file)
      mergeMessages([await sendImageMessage(roomId, prepared)])
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSendingImage(false)
    }
  }

  const onSend = async (e) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setSending(true)
    // 내가 보낸 직후에는 어디를 읽고 있었든 맨 아래로 (백로그 18번). 응답 후가 아니라 **전송 시작 시점**에
    // 켜는 이유: 내 메시지가 REST 응답보다 WS 푸시로 먼저 도착하면(AFTER_COMMIT 경쟁 — 검증에서 실측)
    // 응답 후의 병합은 중복 제거로 no-op이 되어 스크롤 effect가 아예 돌지 않는다
    stickBottomRef.current = true
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

      {/* 공지 배너 (3차) — 원본 위치로 점프는 v1 제외(명세), 전문 표시로 갈음 */}
      {pinned && (
        <div className="pin-banner">
          <span className="pin-content">
            {/* 배너도 같은 content를 렌더한다 — 말풍선에서만 링크가 되면 "공지로 올리면 링크가 죽는" 셈이 된다.
                이미지 메시지를 공지로 고정하면 content가 null이라 아무것도 안 보이므로 대체 문구를 쓴다 (F10b) */}
            📌 <strong>{pinned.senderName}</strong>{' '}
            {pinned.imageUrl ? '사진' : linkify(pinned.content)}
          </span>
          {canPin && (
            <button type="button" onClick={onUnpin}>해제</button>
          )}
        </div>
      )}

      {!connected && <p className="chat-status">실시간 연결 중…</p>}
      {loadingOlder && <p className="chat-status">이전 대화 불러오는 중…</p>}
      {!hasMore && messages.length > 0 && <p className="chat-status">대화의 시작입니다</p>}

      <ul className="chat-messages" ref={listRef} onScroll={onListScroll}>
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
            {/* 이미지 메시지는 content가 null이다 (F10b) — 둘 중 하나만 값이 있다.
                본문의 URL은 링크로 (F10a). HTML 문자열을 만들지 않는 이유는 linkify 주석 참조 */}
            {message.imageUrl ? (
              <a href={message.imageUrl} target="_blank" rel="noopener noreferrer">
                <img className="chat-image" src={message.imageUrl} alt="보낸 사진" />
              </a>
            ) : (
              linkify(message.content)
            )}
            {/* 공지 고정 버튼 — 권한자(OWNER·MANAGER)에게만. 이미 고정된 메시지에는 표시하지 않는다 */}
            {canPin && pinned?.id !== message.id && (
              <button
                type="button" className="pin-button" aria-label="공지로 고정"
                onClick={() => onPin(message.id)}
              >
                📌
              </button>
            )}
          </li>
        ))}
      </ul>

      {sendError && <p className="submit-error">{sendError}</p>}
      <form className="chat-send" onSubmit={onSend}>
        {/* 사진 첨부 (F10b) — label이 file input을 연다. input을 display:none으로 숨기면
            Tab으로 도달할 수 없으므로 CSS에서 visually-hidden으로만 가린다 (백로그 84번) */}
        <label className="chat-image-button" title="사진 보내기">
          {sendingImage ? '…' : '📷'}
          <span className="visually-hidden-text">사진 보내기</span>
          <input
            type="file" accept={IMAGE_ACCEPT}
            onChange={onImageChange} disabled={sendingImage || sending}
          />
        </label>
        <input
          type="text" value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="메시지를 입력하세요 (1000자 이내)" maxLength={1000}
        />
        <button type="submit" disabled={sending || sendingImage}>
          전송
        </button>
      </form>
    </main>
  )
}
