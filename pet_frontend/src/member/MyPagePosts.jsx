import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteShorts, getMemberShorts } from '../shorts/shortsApi'
import { useAuth } from './AuthContext'
import './member.css'

/**
 * 마이페이지 — 내 게시물(릴스) 탭 (docs/plan-2026-08-13.md F8, api-spec.md 8절).
 *
 * 2026-08-26에 자리표시자를 걷어내고 구현했다. 필요한 조회 API가 shorts 슬라이스라 협의를
 * 기다리던 카드였는데, 협의가 끝나 목록 조회(`GET /api/shorts/members/{memberId}`)까지
 * 이 슬라이스가 만들었다. 삭제는 이미 있던 `DELETE /api/shorts/{shortId}`를 그대로 쓴다.
 *
 * 설계 판단 세 가지:
 * - **재생은 여기서 하지 않는다.** 항목을 누르면 공유 링크와 같은 `/shorts?v={id}`로 보낸다.
 *   그리드 안에 플레이어를 또 만들면 음악·트림·오버레이 재생 규칙이 피드와 두 벌이 된다.
 * - **정렬 토글은 URL이 아니라 로컬 상태**다. 마이페이지 탭 자체가 이미 URL이고(F1),
 *   정렬까지 경로에 넣으면 탭 활성 판정(MyPage의 OTHER_TAB_PREFIXES)이 함께 복잡해진다.
 * - **삭제 후 목록 전체를 다시 읽지 않는다.** 펫 탭은 그렇게 하지만 그쪽은 페이지네이션이
 *   없다 — 여기서 첫 페이지를 다시 읽으면 스크롤로 불러온 뒷 페이지가 통째로 사라진다.
 *   커서는 지운 항목과 무관하게 유효하므로 화면에서만 빼는 쪽이 맞다.
 */

const SORTS = [
  { key: 'latest', label: '최신순' },
  // 서버 기준은 좋아요 수다(api-spec.md 8절). 라벨을 "인기순"으로 두되 화면에 좋아요 수를
  // 함께 보여줘서, 왜 그 순서인지 사용자가 항목만 보고 알 수 있게 한다
  { key: 'popular', label: '인기순' },
]

// 12 → "0:12", 75 → "1:15". 초 단위 정수만 온다(durationSec)
function formatDuration(seconds) {
  if (seconds == null) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export default function MyPagePosts() {
  const { user } = useAuth()
  const memberId = user?.id

  const [sort, setSort] = useState('latest')
  const [items, setItems] = useState(null) // null = 아직 불러오는 중
  const [cursor, setCursor] = useState(null)
  const [hasNext, setHasNext] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  // 정렬이 바뀌면 첫 페이지부터 다시 — 커서는 정렬마다 구성이 달라 그대로 쓸 수 없다
  useEffect(() => {
    if (!memberId) return undefined
    let cancelled = false
    setItems(null)
    setError('')
    getMemberShorts(memberId, { sort })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setCursor(data.nextCursor)
        setHasNext(data.hasNext)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [memberId, sort])

  const onLoadMore = async () => {
    setLoadingMore(true)
    setError('')
    try {
      // nextCursor를 해석하지 않고 그대로 돌려보낸다 (서버만 아는 불투명 값)
      const data = await getMemberShorts(memberId, { sort, cursor })
      setItems((prev) => [...prev, ...data.items])
      setCursor(data.nextCursor)
      setHasNext(data.hasNext)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const onDelete = async (short) => {
    if (!window.confirm('이 릴스를 삭제할까요? 피드에서도 사라집니다.')) return
    setError('')
    setDeletingId(short.id)
    try {
      await deleteShorts(short.id)
      // 서버 재조회가 아니라 화면에서만 뺀다 (파일 상단 세 번째 판단 참고)
      setItems((prev) => prev.filter((item) => item.id !== short.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section>
      <h2>내 게시물</h2>
      <nav className="mypage-posts-nav">
        <Link className="w-link" to="/shorts/create">+ 릴스 만들기</Link>
      </nav>

      <div className="mypage-posts-sorts" role="group" aria-label="정렬">
        {SORTS.map((option) => (
          <button
            key={option.key}
            type="button"
            className="w-chip"
            // aria-pressed는 표시(warm.css가 이 속성으로 선택 상태를 그린다)와 스크린리더 안내를
            // 겸한다 — 색만으로 구분하면 읽어주는 쪽에서는 어느 쪽이 켜졌는지 알 수 없다
            aria-pressed={sort === option.key}
            onClick={() => setSort(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {items === null && !error && <p className="muted-note">불러오는 중…</p>}
      {items && items.length === 0 && (
        <p className="muted-note">아직 올린 릴스가 없습니다. 위 버튼으로 만들어 보세요.</p>
      )}

      {items && items.length > 0 && (
        <ul className="mypage-post-grid">
          {items.map((short) => (
            <li key={short.id}>
              {/* 재생은 피드가 담당한다 — 공유 링크와 같은 주소로 보낸다 */}
              <Link className="mypage-post-thumb" to={`/shorts?v=${short.id}`}>
                {short.thumbnailUrl ? (
                  <img src={short.thumbnailUrl} alt={short.caption ?? '릴스 미리보기'} />
                ) : (
                  /* 커버를 굽지 못한 영상 — 첫 프레임으로 대신한다.
                     #t=0.1을 붙이는 이유: preload=metadata만으로는 첫 프레임을 그리지 않는
                     브라우저가 있어 그 자리가 검은 칸으로 남는다 */
                  <video
                    src={`${short.videoUrl}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    aria-label={short.caption ?? '릴스 미리보기'}
                  />
                )}
                <span className="mypage-post-duration">{formatDuration(short.durationSec)}</span>
                {/* 인기순의 기준이라 타일에 남긴다 (CSS 주석 참고) */}
                <span className="mypage-post-stat">♥ {short.likeCount}</span>
              </Link>
              {/* <Link> 안에 넣을 수 없어(a 안의 button은 잘못된 중첩) 형제로 두고 타일 위에 겹친다.
                  아이콘만 있는 버튼이라 aria-label로 무엇을 지우는지까지 읽어준다 */}
              <button
                type="button"
                className="mypage-post-delete"
                aria-label={`${short.caption ?? '이 릴스'} 삭제`}
                onClick={() => onDelete(short)}
                disabled={deletingId === short.id}
              >
                {deletingId === short.id ? '…' : '✕'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasNext && (
        <button
          type="button"
          className="w-ghost block mypage-posts-more"
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </section>
  )
}
