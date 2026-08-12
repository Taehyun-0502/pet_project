import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRooms, joinRoom } from './chatApi'
import { ROOM_CATEGORIES, categoryLabel } from './roomCategories'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
import './chat.css'

// 오픈채팅 방 목록 — 검색·필터 + 입장(join, 멱등). 생성은 /chat/new(ChatRoomCreatePage)로 분리 (2026-08-11)
export default function ChatRoomListPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null) // null = 불러오는 중
  const [error, setError] = useState('')

  // 검색·필터 (3차) — keyword만 300ms 디바운스, 칩·정렬 변경은 즉시 조회
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('') // '' = 전체
  const [sort, setSort] = useState('recent')
  const filterActive = keyword.trim() !== '' || categoryFilter !== ''

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      getRooms({ keyword: keyword.trim() || undefined, category: categoryFilter || undefined, sort })
        .then((list) => {
          if (cancelled) return
          setRooms(list)
          setError('')
        })
        .catch((err) => {
          if (!cancelled) setError(err.message)
        })
    }, keyword.trim() ? 300 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [keyword, categoryFilter, sort])

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

      {/* 생성은 별도 페이지 — 목록은 찾기·입장에 집중한다 (pet 목록의 "+ 등록" 링크와 같은 패턴) */}
      <Link to="/chat/new" className="chat-new-link">+ 방 만들기</Link>

      <div className="chat-filter">
        <input
          type="search" value={keyword} onChange={(e) => setKeyword(e.target.value)}
          placeholder="방 이름·소개 검색" aria-label="방 검색"
        />
        <div className="chat-filter-row">
          <button
            type="button"
            className={`chat-chip${categoryFilter === '' ? ' active' : ''}`}
            onClick={() => setCategoryFilter('')}
          >
            전체
          </button>
          {ROOM_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`chat-chip${categoryFilter === c.value ? ' active' : ''}`}
              onClick={() => setCategoryFilter(categoryFilter === c.value ? '' : c.value)}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            className="chat-sort"
            onClick={() => setSort(sort === 'recent' ? 'popular' : 'recent')}
          >
            {sort === 'recent' ? '최신순' : '참여자순'} ↕
          </button>
        </div>
      </div>

      {error && <p className="submit-error">{error}</p>}
      {rooms === null && !error && <p>불러오는 중…</p>}
      {rooms && rooms.length === 0 && (
        <p>{filterActive ? '검색 결과가 없습니다.' : '아직 방이 없습니다. 첫 방을 만들어 보세요.'}</p>
      )}
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
