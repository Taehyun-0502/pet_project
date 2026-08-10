import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRoom, getRooms, joinRoom } from './chatApi'
import './chat.css'

// 오픈채팅 방 목록 + 생성. 방 클릭 = 입장(join, 멱등) 후 채팅방으로 이동
export default function ChatRoomListPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null) // null = 불러오는 중
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getRooms()
      .then(setRooms)
      .catch((err) => setError(err.message))
  }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('방 이름을 입력해 주세요.')
      return
    }
    if (trimmed.length > 100) {
      setError('방 이름은 100자 이하여야 합니다.')
      return
    }
    setCreating(true)
    try {
      const room = await createRoom({ name: trimmed })
      // 생성자는 이미 OWNER로 참여된 상태 — 바로 채팅방으로 (방 이름은 화면 표시용으로 전달)
      navigate(`/chat/rooms/${room.id}`, { state: { roomName: room.name } })
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  const onEnter = async (room) => {
    setError('')
    try {
      await joinRoom(room.id) // 이미 참여 중이어도 성공(멱등)
      navigate(`/chat/rooms/${room.id}`, { state: { roomName: room.name } })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <h1>오픈채팅</h1>
        <Link to="/">← 홈으로</Link>
      </header>

      <form className="chat-create" onSubmit={onCreate}>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="새 방 이름 (예: 푸들 보호자 모임)"
        />
        <button type="submit" disabled={creating}>
          {creating ? '만드는 중…' : '방 만들기'}
        </button>
      </form>

      {error && <p className="submit-error">{error}</p>}
      {rooms === null && !error && <p>불러오는 중…</p>}
      {rooms && rooms.length === 0 && <p>아직 방이 없습니다. 첫 방을 만들어 보세요.</p>}
      {rooms && rooms.length > 0 && (
        <ul className="chat-room-list">
          {rooms.map((room) => (
            <li key={room.id} onClick={() => onEnter(room)}>
              <strong>{room.name}</strong>
              {/* unreadCount: 미참여 방은 null(배지 없음), 표시는 99+ 상한 (docs/api-spec.md 7절) */}
              {room.unreadCount > 0 && (
                <span className="unread-badge">
                  {room.unreadCount > 99 ? '99+' : room.unreadCount}
                </span>
              )}
              <span className="count">{room.participantCount}명 참여 중</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
