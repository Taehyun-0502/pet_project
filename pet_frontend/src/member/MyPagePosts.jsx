import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DeleteConfirm from '../common/DeleteConfirm'
import { deleteShorts, getMemberShorts } from '../shorts/shortsApi'
import { useAuth } from './AuthContext'
import './member.css'

/**
 * 마이페이지 — 내 게시물(숏츠) 탭 (docs/plan-2026-08-13.md F8, api-spec.md 8절).
 *
 * 2026-08-26에 자리표시자를 걷어내고 구현했다. 필요한 조회 API가 shorts 슬라이스라 협의를
 * 기다리던 카드였는데, 협의가 끝나 목록 조회(`GET /api/shorts/members/{memberId}`)까지
 * 이 슬라이스가 만들었다. 삭제는 이미 있던 `DELETE /api/shorts/{shortId}`를 그대로 쓴다.
 *
 * 설계 판단 세 가지:
 * - **재생은 여기서 하지 않는다.** 항목을 누르면 `/shorts?v={id}&only=1`로 보낸다.
 *   그리드 안에 플레이어를 또 만들면 음악·트림·오버레이 재생 규칙이 피드와 두 벌이 된다.
 *   `only=1`은 그 영상 하나만 보여주고 다른 영상으로 넘기지 않는다(ShortsFeed의 singleRef).
 *   공유 링크는 이 플래그 없이 `?v=`만 쓰며, 그 뒤로 평소 피드가 이어진다.
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

/*
 * 영상을 보고 **돌아왔을 때** 화면을 그대로 되살리기 위한 값 (2026-08-26 사용자 요청).
 *
 * 정렬은 로컬 상태이고(위 두 번째 판단) 스크롤은 어디에도 남지 않으므로, 영상을 열러 나가는
 * 순간 정렬·스크롤·불러와 있던 개수를 적어 두고 돌아올 때 그대로 되살린다.
 *
 * sessionStorage를 쓰는 이유: 이 탭 안에서만 유효하면 된다. 새로고침이나 다음 방문에까지
 * 지난 스크롤을 되살리면 오히려 놀란다.
 *
 * 되살리기는 **한 번만** 한다 — 읽고 나면 지운다.
 *
 * 전에는 숏츠 화면의 돌아가기 버튼이 실어 보내는 신호(`state.restoreView`)가 있을 때만
 * 되살렸다. 그런데 그러면 **스마트폰의 뒤로 가기**로 돌아온 경우가 빠진다 — 히스토리를
 * 되짚는 이동에는 그 신호가 없기 때문이다(2026-08-26 사용자 지적).
 *
 * 그래서 신호를 보지 않고 "저장된 값이 있으면 되살리고 지운다"로 바꿨다. 이 값은 **이 탭에서
 * 썸네일을 눌러 나갈 때만** 쓰이므로, 있다는 것 자체가 "보고 돌아왔다"는 뜻이다. 한 번 쓰고
 * 지우니 그 뒤에 이 탭을 다시 열면 평소처럼 맨 위에서 시작한다 — 홈에서 처음 들어온 사람이
 * 영문 모를 자리에서 시작하는 일도 이것으로 막힌다.
 */
const RESTORE_KEY = 'mypage-posts-view'

// 저장·읽기 모두 실패를 삼킨다 — 사파리 프라이빗 모드 등에서는 접근 자체가 예외를 던지는데,
// 화면 되살리기는 부가 기능이라 그것 때문에 목록이 안 뜨면 안 된다
function readView() {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeView(view) {
  try {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify(view))
  } catch {
    /* 위와 같다 */
  }
}

function clearView() {
  try {
    sessionStorage.removeItem(RESTORE_KEY)
  } catch {
    /* 위와 같다 */
  }
}

/**
 * 실제로 스크롤되는 조상을 찾는다.
 *
 * `document.scrollingElement`를 쓰면 안 된다 — 앱바가 있는 화면은 문서가 아니라
 * **`<main>` 안에서** 스크롤된다(appShell.css의 `#root:has(.appbar) > main`은
 * `overflow-y: auto`이고 #root는 `overflow: hidden`이다). 문서 기준으로 읽으면 값이 항상
 * 0이고 쓰기도 무효라, 스크롤 위치가 저장도 복원도 되지 않는다(2026-08-26 실제로 그랬다).
 *
 * 특정 선택자(`#root > main`)를 박아두지 않고 올라가며 찾는 이유: 스크롤 주체가 문서에서
 * main으로 옮겨진 적이 이미 한 번 있다. 구조가 또 바뀌어도 이 함수는 따라간다.
 */
function scrollParentOf(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  // 어느 조상도 스크롤하지 않으면 문서가 스크롤된다 (앱바 없는 화면)
  return document.scrollingElement
}

// 12 → "0:12", 75 → "1:15". 초 단위 정수만 온다(durationSec)
function formatDuration(seconds) {
  if (seconds == null) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export default function MyPagePosts() {
  const { user } = useAuth()
  const memberId = user?.id

  /*
   * 되살릴 값. useRef 초기값이라 **첫 렌더에 한 번** 정해지고, 아래 조회 effect가 쓰고 나면
   * 비운다(정렬을 바꿔 다시 조회할 때 또 되살리면 안 된다).
   *
   * 저장소에서 지우는 것은 아래 마운트 effect가 한다 — 렌더 중에 지우면 부수효과가 렌더에
   * 섞인다(리액트가 렌더를 여러 번 호출할 수 있다).
   */
  const restoreRef = useRef(readView())
  // 되돌릴 스크롤 위치. 목록이 실제로 그려진 뒤에 적용해야 해서 따로 들고 있는다
  const pendingScrollRef = useRef(restoreRef.current?.scrollTop ?? null)
  // 스크롤되는 조상을 찾기 위한 시작점 (아래 <section>에 붙는다)
  const rootRef = useRef(null)

  const [sort, setSort] = useState(restoreRef.current?.sort ?? 'latest')
  const [items, setItems] = useState(null) // null = 아직 불러오는 중
  const [cursor, setCursor] = useState(null)
  const [hasNext, setHasNext] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null) // 삭제 2단 확인이 떠 있는 타일
  const [deletingId, setDeletingId] = useState(null)

  /*
   * 저장된 값을 지운다 — "한 번만" 되살리기 위한 것이다 (RESTORE_KEY 주석).
   * 위에서 이미 ref로 읽어 뒀으므로 지워도 이번 복원에는 영향이 없다.
   */
  useEffect(() => {
    clearView()
  }, [])

  // 정렬이 바뀌면 첫 페이지부터 다시 — 커서는 정렬마다 구성이 달라 그대로 쓸 수 없다
  useEffect(() => {
    if (!memberId) return undefined
    let cancelled = false

    /*
     * 돌아온 첫 조회에서만 **예전에 불러와 있던 개수만큼 한 번에** 받는다.
     * "더 보기"로 2페이지 이상 열어둔 상태에서 돌아오면, 첫 페이지(20개)만 받아서는
     * 되돌릴 스크롤 위치에 내용이 없어 화면이 끝으로 밀린다.
     * 서버가 size를 50으로 자르므로(ShortsService.MAX_LIST_SIZE) 그보다 많이 열어둔
     * 경우에는 50개까지만 복원되고 스크롤도 그 높이에서 멈춘다.
     */
    const size = restoreRef.current?.count > 0 ? restoreRef.current.count : undefined
    restoreRef.current = null

    setItems(null)
    setError('')
    getMemberShorts(memberId, { sort, size })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setCursor(data.nextCursor)
        setHasNext(data.hasNext)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [memberId, sort])

  /*
   * 목록이 그려진 뒤에 스크롤을 되돌린다.
   *
   * setItems 직후(then 안)에 하면 먹지 않는다 — 그 시점에는 아직 타일이 DOM에 없어서
   * 문서 높이가 스크롤 위치에 못 미치고, 브라우저가 값을 잘라버린다. effect는 커밋 뒤에
   * 돌기 때문에 높이가 이미 잡혀 있다.
   *
   * 타일이 aspect-ratio: 9/16(member.css)이라 썸네일 이미지가 늦게 와도 높이가 변하지
   * 않는다 — 그래서 이미지 로드를 기다릴 필요가 없다.
   */
  useEffect(() => {
    const top = pendingScrollRef.current
    if (top == null || items == null) return
    pendingScrollRef.current = null
    scrollParentOf(rootRef.current)?.scrollTo({ top })
  }, [items])

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

  // 확인은 window.confirm이 아니라 타일 위 DeleteConfirm이 담당한다 (2026-08-27 —
  // 대화상자 억제 환경에서 confirm이 조용히 false를 반환해 삭제가 무반응이던 결함)
  const onDelete = async (short) => {
    setError('')
    setDeletingId(short.id)
    try {
      await deleteShorts(short.id)
      // 서버 재조회가 아니라 화면에서만 뺀다 (파일 상단 세 번째 판단 참고)
      setItems((prev) => prev.filter((item) => item.id !== short.id))
      setConfirmId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    /* ref — 스크롤되는 조상을 여기서부터 올라가며 찾는다 (scrollParentOf 주석) */
    <section ref={rootRef}>
      <h2>내 게시물</h2>
      <nav className="mypage-posts-nav">
        <Link className="w-link" to="/shorts/create">+ 숏츠 만들기</Link>
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
        <p className="muted-note">아직 올린 숏츠가 없습니다. 위 버튼으로 만들어 보세요.</p>
      )}

      {items && items.length > 0 && (
        <ul className="mypage-post-grid">
          {items.map((short) => (
            <li key={short.id}>
              {/* 재생은 피드가 담당한다. only=1은 **이 영상 하나만** 보여달라는 뜻이다 —
                  스크롤로 다른 영상으로 넘어가지 않는다 (2026-08-26 사용자 요청).
                  공유 링크(only 없음)는 그 영상 뒤로 평소 피드가 이어지는 쪽을 그대로 쓴다 */}
              <Link
                className="mypage-post-thumb"
                to={`/shorts?v=${short.id}&only=1`}
                /* 나가기 직전의 화면을 적어 둔다 — 돌아왔을 때 되살릴 값이다 (RESTORE_KEY 주석).
                   unmount 시점이 아니라 여기서 하는 이유: 영상 화면으로 가는 길이 이 링크뿐이고,
                   언마운트는 다른 탭으로 옮길 때도 일어나 그때의 스크롤까지 덮어쓰게 된다 */
                onClick={() =>
                  writeView({
                    sort,
                    count: items?.length ?? 0,
                    scrollTop: scrollParentOf(rootRef.current)?.scrollTop ?? 0,
                  })
                }
              >
                {short.thumbnailUrl ? (
                  <img src={short.thumbnailUrl} alt={short.caption ?? '숏츠 미리보기'} />
                ) : (
                  /* 커버를 굽지 못한 영상 — 첫 프레임으로 대신한다.
                     #t=0.1을 붙이는 이유: preload=metadata만으로는 첫 프레임을 그리지 않는
                     브라우저가 있어 그 자리가 검은 칸으로 남는다 */
                  <video
                    src={`${short.videoUrl}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    aria-label={short.caption ?? '숏츠 미리보기'}
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
                aria-label={`${short.caption ?? '이 숏츠'} 삭제`}
                onClick={() => setConfirmId(confirmId === short.id ? null : short.id)}
              >
                ✕
              </button>
              {confirmId === short.id && (
                /* 좁은 타일이라 문구는 짧게 — "피드에서도 사라집니다"는 aria-label(✕ 버튼)과
                   confirm 시절 문구에서 내려놓고, 겹칠 자리가 없어 하단 띠로 얹는다 */
                <DeleteConfirm
                  className="mypage-post-confirm"
                  message="삭제할까요?"
                  busy={deletingId === short.id}
                  onConfirm={() => onDelete(short)}
                  onCancel={() => setConfirmId(null)}
                />
              )}
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
