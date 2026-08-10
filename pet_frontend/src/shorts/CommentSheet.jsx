// 댓글 시트 — 영상 위로 올라오는 패널. 9:16 프레임 안에 들어가도록 카드 기준으로 배치된다.
// 구조는 2단까지: 댓글 → 대댓글. 대댓글에 다시 답글은 서버가 막는다.

import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import { createComment, getComments, toggleCommentLike } from './shortsApi'

const MAX_CONTENT = 500

// 방금/오늘/날짜 — 초 단위까지 보여줄 필요가 없는 화면이라 대략적으로만 표시한다
function timeAgo(iso) {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return '방금'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

const HeartSmall = ({ filled }) => (
  <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

/** 댓글 한 줄. 대댓글도 같은 컴포넌트를 쓰고, isReply일 때만 답글 버튼을 감춘다 */
function CommentRow({ comment, isReply, onReply, onLike }) {
  return (
    <li className={isReply ? 'cs-item cs-reply' : 'cs-item'}>
      <div className="cs-body">
        <span className="cs-name">@{comment.memberName}</span>
        <span className="cs-time">{timeAgo(comment.createdAt)}</span>
        <p className="cs-content">{comment.content}</p>
        {!isReply && (
          <button type="button" className="cs-reply-btn" onClick={() => onReply(comment)}>
            답글
          </button>
        )}
      </div>
      <button
        type="button"
        className={comment.likedByMe ? 'cs-like cs-liked' : 'cs-like'}
        onClick={() => onLike(comment)}
        aria-label="댓글 좋아요"
      >
        <HeartSmall filled={comment.likedByMe} />
        <span>{comment.likeCount}</span>
      </button>
    </li>
  )
}

export default function CommentSheet({ shortId, onClose, onCountChange }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null) // null = 불러오는 중
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState(null) // 답글 대상 최상위 댓글
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getComments(shortId)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [shortId])

  // 로그인이 필요한 동작은 여기서 한 번에 막는다 (서버도 401로 막지만 그 전에 안내가 낫다)
  const requireLogin = () => {
    if (user) return false
    navigate('/login')
    return true
  }

  const onLike = async (comment) => {
    if (requireLogin()) return
    setError('')
    try {
      const res = await toggleCommentLike(comment.id)
      // 서버가 준 값으로 해당 댓글만 갈아끼운다 (대댓글도 같은 규칙)
      setData((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (item.id === comment.id) {
            return { ...item, likedByMe: res.liked, likeCount: res.likeCount }
          }
          return {
            ...item,
            replies: item.replies.map((reply) =>
              reply.id === comment.id
                ? { ...reply, likedByMe: res.liked, likeCount: res.likeCount }
                : reply,
            ),
          }
        }),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (requireLogin()) return
    const text = content.trim()
    if (!text) return

    setSubmitting(true)
    setError('')
    try {
      const created = await createComment(shortId, {
        content: text,
        parentId: replyTo ? replyTo.id : null,
      })
      setData((prev) => ({
        items: replyTo
          ? prev.items.map((item) =>
              item.id === replyTo.id ? { ...item, replies: [...item.replies, created] } : item,
            )
          : [...prev.items, created],
        totalCount: prev.totalCount + 1,
      }))
      onCountChange(1) // 카드의 댓글 수 표시도 함께 올린다
      setContent('')
      setReplyTo(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // 카드의 탭(재생/일시정지)이 시트 조작에 반응하지 않게 이벤트를 막는다
    <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="cs-head">
        <strong>댓글 {data ? data.totalCount : ''}</strong>
        <button type="button" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="cs-scroll">
        {error && <p className="cs-error">{error}</p>}
        {data === null && !error && <p className="cs-empty">불러오는 중…</p>}
        {data && data.items.length === 0 && (
          <p className="cs-empty">첫 댓글을 남겨보세요.</p>
        )}
        {data && data.items.length > 0 && (
          <ul className="cs-list">
            {data.items.map((comment) => (
              // 부모 다음에 그 대댓글들을 이어서 놓는다. 2단이라 재귀가 필요 없다
              <Fragment key={comment.id}>
                <CommentRow comment={comment} isReply={false} onReply={setReplyTo} onLike={onLike} />
                {comment.replies.map((reply) => (
                  <CommentRow key={reply.id} comment={reply} isReply onReply={setReplyTo} onLike={onLike} />
                ))}
              </Fragment>
            ))}
          </ul>
        )}
      </div>

      <form className="cs-form" onSubmit={onSubmit}>
        {replyTo && (
          <div className="cs-replying">
            <span>@{replyTo.memberName}에게 답글</span>
            <button type="button" onClick={() => setReplyTo(null)}>
              취소
            </button>
          </div>
        )}
        <div className="cs-input-row">
          <input
            type="text"
            value={content}
            maxLength={MAX_CONTENT}
            onChange={(e) => setContent(e.target.value)}
            placeholder={user ? '댓글 달기…' : '로그인하면 댓글을 쓸 수 있어요'}
            disabled={submitting}
          />
          <button type="submit" disabled={submitting || !content.trim()}>
            {submitting ? '…' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}
