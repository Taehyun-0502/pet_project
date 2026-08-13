import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyRooms, getRooms, joinRoom, pinRoom, unpinRoom } from './chatApi'
import { ROOM_CATEGORIES, categoryLabel } from './roomCategories'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
import './chat.css'

/**
 * 방 한 줄 — "내 방"과 "전체" 두 목록이 같은 모양을 쓴다.
 * 복제하면 배지·정원 표기 규칙이 두 곳으로 갈라지므로 컴포넌트로 뽑았다.
 * `actions`는 줄 오른쪽에 덧붙일 요소(내 방의 고정 버튼) — 없으면 아무것도 그리지 않는다.
 */
function RoomRow({ room, onEnter, actions }) {
  return (
    <li onClick={() => onEnter(room)}>
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
      {actions}
    </li>
  )
}

// 오픈채팅 방 목록 — 내 방(고정핀) + 검색·필터 + 입장(join, 멱등).
// 생성은 /chat/new(ChatRoomCreatePage)로 분리 (2026-08-11)
export default function ChatRoomListPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null) // null = 불러오는 중
  const [error, setError] = useState('')

  // 내가 참여 중인 방 (F7) — 검색·필터와 무관하게 항상 상단에 보인다
  const [myRooms, setMyRooms] = useState(null)
  const [pinningId, setPinningId] = useState(null)

  const loadMyRooms = useCallback(() => {
    getMyRooms()
      .then(setMyRooms)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => { loadMyRooms() }, [loadMyRooms])

  const onTogglePin = async (room) => {
    setError('')
    setPinningId(room.id)
    try {
      await (room.pinned ? unpinRoom(room.id) : pinRoom(room.id))
      // 로컬에서 뒤집지 않고 다시 읽는다 — 고정은 순서까지 바꾸므로 서버 정렬을 그대로 받는 편이 맞다
      loadMyRooms()
    } catch (err) {
      // 상한 초과(400 CHAT_ROOM_PIN_LIMIT) 등 — 서버 메시지를 그대로 보여준다
      setError(err.message)
    } finally {
      setPinningId(null)
    }
  }

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

      {/* 내 방 (F7) — 아래 검색·필터는 "전체" 목록에만 적용된다. 참여 중인 방을 찾으려고
          매번 검색하지 않아도 되게 하는 것이 이 섹션의 목적이라, 필터에 딸려 사라지면 안 된다 */}
      {myRooms && myRooms.length > 0 && (
        <section className="chat-my-rooms">
          <h2>내 방</h2>
          <ul className="chat-room-list">
            {myRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                onEnter={onEnter}
                actions={(
                  <button
                    type="button"
                    className={`room-pin${room.pinned ? ' active' : ''}`}
                    aria-pressed={room.pinned}
                    aria-label={room.pinned ? `${room.name} 고정 해제` : `${room.name} 고정`}
                    disabled={pinningId === room.id}
                    onClick={(e) => {
                      // li 전체가 입장 클릭이라 막지 않으면 고정하면서 방에 들어가 버린다
                      e.stopPropagation()
                      onTogglePin(room)
                    }}
                  >
                    📌
                  </button>
                )}
              />
            ))}
          </ul>
        </section>
      )}

      {myRooms && myRooms.length > 0 && <h2 className="chat-section-title">전체</h2>}

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
            <RoomRow key={room.id} room={room} onEnter={onEnter} />
          ))}
        </ul>
      )}
    </main>
  )
}
