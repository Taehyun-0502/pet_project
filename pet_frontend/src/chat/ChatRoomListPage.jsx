import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRoom, getRooms, joinRoom } from './chatApi'
import { ROOM_CATEGORIES, categoryLabel } from './roomCategories'
import './chat.css'

// 오픈채팅 방 목록 + 생성. 방 클릭 = 입장(join, 멱등) 후 채팅방으로 이동
export default function ChatRoomListPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null) // null = 불러오는 중
  // 방 프로필 (docs/api-spec.md 7절 3차) — category 필수, 소개·정원은 선택
  const [form, setForm] = useState({ name: '', category: 'FREE', description: '', maxMembers: '' })
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getRooms()
      .then(setRooms)
      .catch((err) => setError(err.message))
  }, [])

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onCreate = async (e) => {
    e.preventDefault()
    setError('')
    const name = form.name.trim()
    if (!name) {
      setError('방 이름을 입력해 주세요.')
      return
    }
    if (name.length > 100) {
      setError('방 이름은 100자 이하여야 합니다.')
      return
    }
    if (form.description.trim().length > 200) {
      setError('소개는 200자 이하여야 합니다.')
      return
    }
    // 빈 입력 = 무제한(null). 서버 검증(2~100)과 같은 규칙으로 1차 차단
    const maxMembers = form.maxMembers === '' ? null : Number(form.maxMembers)
    if (maxMembers !== null && (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 100)) {
      setError('정원은 2~100명 사이여야 합니다.')
      return
    }
    setCreating(true)
    try {
      const room = await createRoom({
        name,
        category: form.category,
        description: form.description.trim() || null,
        maxMembers,
      })
      // 생성자는 이미 OWNER로 참여된 상태 — 바로 채팅방으로 (방 객체는 화면 표시용으로 전달)
      navigate(`/chat/rooms/${room.id}`, { state: { room } })
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  const onEnter = async (room) => {
    setError('')
    try {
      // 이미 참여 중이어도 성공(멱등). 정원이 가득 찼으면 409 CHAT_ROOM_FULL
      const joined = await joinRoom(room.id)
      navigate(`/chat/rooms/${room.id}`, { state: { room: joined } })
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
          type="text" name="name" value={form.name} onChange={onChange}
          placeholder="새 방 이름 (예: 푸들 보호자 모임)"
        />
        <div className="chat-create-row">
          <select name="category" value={form.category} onChange={onChange} aria-label="카테고리">
            {ROOM_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            type="number" name="maxMembers" value={form.maxMembers} onChange={onChange}
            placeholder="정원 (선택)" min={2} max={100}
          />
        </div>
        <input
          type="text" name="description" value={form.description} onChange={onChange}
          placeholder="소개 (선택, 200자 이내)" maxLength={200}
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
              <div className="room-info">
                <div>
                  <span className="room-category">{categoryLabel(room.category)}</span>
                  <strong>{room.name}</strong>
                  {/* unreadCount: 미참여 방은 null(배지 없음), 표시는 99+ 상한 (docs/api-spec.md 7절) */}
                  {room.unreadCount > 0 && (
                    <span className="unread-badge">
                      {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  )}
                </div>
                {room.description && <p className="room-desc">{room.description}</p>}
              </div>
              <span className="count">
                {room.maxMembers
                  ? `${room.participantCount}/${room.maxMembers}명`
                  : `${room.participantCount}명 참여 중`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
