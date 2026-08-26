import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRoom } from './chatApi'
import { ROOM_CATEGORIES } from './roomCategories'
import '../common/forms.css'
import '../common/warm.css' // 웜톤 공용 토큰·클래스 (chat.css보다 먼저)
import './chat.css'

/**
 * 방 생성 페이지 (docs/api-spec.md 7절 3차). 목록의 인라인 폼에서 분리 (2026-08-11) —
 * 방 프로필 도입으로 폼이 4필드가 되어 목록 상단에 두기엔 무거워졌고,
 * pet의 목록(/) ↔ 등록(/pets/new) 분리와 같은 패턴으로 맞췄다.
 */
export default function ChatRoomCreatePage() {
  const navigate = useNavigate()
  // 방 프로필 — category 필수, 소개·정원은 선택
  const [form, setForm] = useState({ name: '', category: 'FREE', description: '', maxMembers: '' })
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

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
      // 생성자는 이미 OWNER로 참여된 상태 — 바로 채팅방으로 (방 객체는 화면 표시용으로 전달).
      // replace: 뒤로가기가 빈 생성 폼으로 돌아가지 않게 한다 (PetCreatePage와 같은 선택)
      navigate(`/chat/rooms/${room.id}`, { replace: true, state: { room } })
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <main className="warm chat-page">
      <header className="w-top">
        <h1>새 채팅방</h1>
        <Link to="/chat" className="w-link">← 방 목록으로</Link>
      </header>

      <form className="w-card chat-create" onSubmit={onCreate}>
        <input
          className="w-input"
          type="text" name="name" value={form.name} onChange={onChange}
          placeholder="방 이름 (예: 푸들 보호자 모임)"
        />
        {/* 카테고리 — 웜톤 전환으로 select 대신 알약 칩 (목록 필터와 같은 문법, 상태는 form.category 그대로) */}
        <div className="chat-cat-chips" role="group" aria-label="카테고리">
          {ROOM_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="w-chip"
              aria-pressed={form.category === c.value}
              onClick={() => setForm({ ...form, category: c.value })}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          className="w-input"
          type="number" name="maxMembers" value={form.maxMembers} onChange={onChange}
          placeholder="정원 (선택)" min={2} max={100}
        />
        <input
          className="w-input"
          type="text" name="description" value={form.description} onChange={onChange}
          placeholder="소개 (선택, 200자 이내)" maxLength={200}
        />
        {error && <p className="submit-error">{error}</p>}
        <button type="submit" className="w-cta block" disabled={creating}>
          {creating ? '만드는 중…' : '방 만들기'}
        </button>
      </form>
    </main>
  )
}
