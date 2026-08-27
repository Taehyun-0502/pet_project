import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DeleteConfirm from '../common/DeleteConfirm'
import { deletePet, getMyPets, updatePetOrder } from '../pet/petApi'
// pet.css를 빌려 쓰지 않는다 (2026-08-25 스킨 전환 때 결정, 웜톤 전환 후에도 동일) —
// pet 화면은 다른 작업자와 동시 작업 중이라, 이 탭의 행·액션 스타일은 warm.css 공용 클래스
// (w-row·w-link)와 member.css 자체 정의(.mypage-pet-* 계열)로 만든다
import './member.css'

// 수정 화면이 저장 후 돌아올 곳 — navigate state로 넘긴다 (PetEditPage가 받는다).
// 상수로 둔 이유: 이 값이 이 파일의 경로와 어긋나면 "저장했더니 엉뚱한 데로 간다"가 된다
const RETURN_TO = '/mypage/pets'

/**
 * 마이페이지 — 펫 정보 탭 (docs/plan-2026-08-13.md F5).
 *
 * /pets 목록 라우트 폐지(2026-08-25)로 이 탭이 **유일한 전체 목록** 화면이다.
 * 항목을 누르면 그 자리에서 펼쳐지며 상세·수정·삭제가 나온다 (상세 진입은 홈 프로필에도 있다).
 *
 * 설계 판단 두 가지:
 * - **수정은 기존 `/pets/:petId/edit`을 재사용한다.** 여기에 폼을 또 만들면 검증 규칙(petForm.js)과
 *   "빈 칸은 값 삭제"라는 PUT 전체 교체 의미론이 두 곳으로 갈라진다 (백로그 55번이 폼에서 겪은 그 패턴).
 *   대신 `state.from`으로 복귀 경로를 넘겨 저장 후 이 탭으로 돌아오게 한다.
 * - **삭제는 이 화면에서 끝낸다.** 상세를 거치게 하면 관리 흐름이 마이페이지 밖으로 나가고,
 *   삭제 후 홈으로 튕긴다. 여기서 처리하면 목록이 그 자리에서 갱신된다.
 */
export default function MyPagePets() {
  const [pets, setPets] = useState(null) // null = 아직 불러오는 중
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null) // 펼쳐진 항목 (하나만)
  const [confirmId, setConfirmId] = useState(null) // 삭제 2단 확인이 떠 있는 항목
  const [deletingId, setDeletingId] = useState(null)

  // ── 노출 순서 정렬 모드 ("설정" — api-spec.md 2절 PUT /api/pets/order, 2026-08-27) ──
  // 드래그로 순서를 바꾸고 저장하면 홈(접힌 상태)이 맨 위 1마리를 우선 노출한다.
  const [ordering, setOrdering] = useState(false)
  const [draft, setDraft] = useState([]) // 저장 전까지의 임시 순서 (취소하면 버린다)
  const [savingOrder, setSavingOrder] = useState(false)
  const listRef = useRef(null)
  const dragRef = useRef({ idx: null }) // 이동 계산용 (리렌더 불필요한 값)
  const [dragIdx, setDragIdx] = useState(null) // 잡고 있는 행 표시용

  useEffect(() => {
    let cancelled = false
    getMyPets()
      .then((list) => { if (!cancelled) setPets(list) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  // 확인은 window.confirm이 아니라 행 안의 DeleteConfirm이 담당한다 (2026-08-27 —
  // 대화상자 억제 환경에서 confirm이 조용히 false를 반환해 삭제가 무반응이던 결함)
  const onDelete = async (pet) => {
    setError('')
    setDeletingId(pet.id)
    try {
      await deletePet(pet.id)
      // 로컬 배열에서 빼지 않고 서버를 다시 읽는다 — 다른 탭·기기의 변경과 화면이 어긋나지 않게
      // (보안 탭의 기기 원격 로그아웃과 같은 방식)
      setPets(await getMyPets())
      setOpenId(null)
      setConfirmId(null)
    } catch (err) {
      setError(err.message) // 확인 UI는 열어 둔다 — 문구를 보고 재시도하거나 취소할 수 있게
    } finally {
      setDeletingId(null)
    }
  }

  const startOrdering = () => {
    setDraft(pets)
    setOrdering(true)
    setOpenId(null)
    setConfirmId(null)
    setError('')
  }

  const onSaveOrder = async () => {
    setError('')
    setSavingOrder(true)
    try {
      // 성공 응답이 갱신된 목록이라 재조회가 필요 없다 (petApi.updatePetOrder 주석)
      setPets(await updatePetOrder(draft.map((p) => p.id)))
      setOrdering(false)
    } catch (err) {
      setError(err.message)
      // 다른 기기의 등록·삭제와 어긋난 400 — 최신 목록으로 다시 정렬할 수 있게 재조회
      try {
        const fresh = await getMyPets()
        setPets(fresh)
        setDraft(fresh)
      } catch { /* 재조회 실패면 첫 오류 문구를 유지한다 */ }
    } finally {
      setSavingOrder(false)
    }
  }

  const moveDraft = (from, to) => {
    if (to < 0 || to >= draft.length || from === to) return
    setDraft((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // 드래그: 잡은 행이 다른 행의 세로 구간에 들어가면 그 자리로 옮긴다 (행 높이 균일 전제).
  // 터치는 CSS touch-action: none이 화면 스크롤과의 경합을 막는다
  const onDragStart = (e, idx) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // 캡처 실패(이미 끝난 포인터 등)해도 드래그 자체는 이어간다 — move가 리스트 요소 기준이라 동작한다
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 무해 */ }
    dragRef.current.idx = idx
    setDragIdx(idx)
  }
  const onDragMove = (e) => {
    const d = dragRef.current
    if (d.idx === null) return
    const rows = [...listRef.current.querySelectorAll('li')]
    const over = rows.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return e.clientY >= r.top && e.clientY <= r.bottom
    })
    if (over === -1 || over === d.idx) return
    moveDraft(d.idx, over)
    d.idx = over
    setDragIdx(over)
  }
  const onDragEnd = () => {
    dragRef.current.idx = null
    setDragIdx(null)
  }

  // 드래그는 키보드로 못 하므로 행 포커스 + ↑/↓로도 옮길 수 있게 한다
  const onOrderKeyDown = (e, idx) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    moveDraft(idx, e.key === 'ArrowUp' ? idx - 1 : idx + 1)
  }

  return (
    <section>
      <h2>펫 정보</h2>
      <nav className="mypage-pets-nav">
        <Link className="w-link" to="/pets/new">+ 반려동물 등록</Link>
        {/* 순서 바꾸기는 2마리부터 의미가 있다. 정렬 UI는 페이지 전환 없이 바텀시트로 (2026-08-27) */}
        {pets && pets.length >= 2 && (
          <button type="button" className="w-link" onClick={startOrdering}>
            설정
          </button>
        )}
      </nav>
      <p className="muted-note">항목을 누르면 상세·수정·삭제할 수 있습니다.</p>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {pets === null && !error && <p className="muted-note">불러오는 중…</p>}
      {pets && pets.length === 0 && (
        <p className="muted-note">등록된 반려동물이 없습니다. 위 버튼으로 등록해 보세요.</p>
      )}
      {/* 노출 순서 설정 — 바텀시트 (warm.css .w-sheet). 백드롭 클릭·닫기 = 취소 */}
      {ordering && (
        <div
          className="w-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="노출 순서 설정"
          onClick={() => { if (!savingOrder) setOrdering(false) }}
        >
          <div className="w-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="w-sheet-head">
              <div className="w-sheet-title">노출 순서 설정</div>
              <button
                type="button"
                className="w-link"
                onClick={() => setOrdering(false)}
                disabled={savingOrder}
              >
                닫기
              </button>
            </div>
            <p className="muted-note">행을 끌어 순서를 바꾸세요 — 맨 위의 아이가 홈 화면에 먼저 보입니다.</p>
            {/* 저장 실패(다른 기기와 어긋남 등) 안내 — 시트가 화면을 덮고 있어 여기 띄운다 */}
            {error && <p className="submit-error" role="alert">{error}</p>}
            <ul className="mypage-pet-list mypage-pet-order" ref={listRef}>
              {draft.map((pet, i) => (
            <li key={pet.id}>
              <div
                className={dragIdx === i ? 'mypage-pet-order-row dragging' : 'mypage-pet-order-row'}
                role="button"
                tabIndex={0}
                aria-label={`${pet.name} — 현재 ${i + 1}번째. 끌거나 화살표 키로 순서 변경`}
                onPointerDown={(e) => onDragStart(e, i)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                onKeyDown={(e) => onOrderKeyDown(e, i)}
              >
                {/* 1위 = 홈 접힌 상태에 노출됨을 순번 색으로 알린다 (안내 문구와 2중,
                    2026-08-27 홈 표시 2→1마리 축소에 맞춤) */}
                <span
                  className={i < 1 ? 'mypage-pet-order-rank top' : 'mypage-pet-order-rank'}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="mypage-pet-order-main">
                  <b>{pet.name}</b>
                  <span className="sub">{pet.breed ?? '품종 미입력'}</span>
                </span>
                <span className="mypage-pet-order-handle" aria-hidden="true">⠿</span>
              </div>
            </li>
              ))}
            </ul>
            <button
              type="button"
              className="w-cta block"
              onClick={onSaveOrder}
              disabled={savingOrder}
            >
              {savingOrder ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {pets && pets.length > 0 && !ordering && (
        <ul className="mypage-pet-list">
          {pets.map((pet) => {
            const open = openId === pet.id
            return (
              <li key={pet.id}>
                {/* 항목은 <button> — li에 onClick을 걸면 키보드로 접근할 수 없다.
                    홈 목록이 <Link>인 것과 대비되는데, 여기서는 이동이 아니라 펼침이라 버튼이 맞다 */}
                <button
                  type="button"
                  className="w-row"
                  aria-expanded={open}
                  // 접었다 펴면 삭제 확인도 초기화 — 접힌 채 남은 확인이 다음 펼침에서 튀어나오지 않게
                  onClick={() => { setOpenId(open ? null : pet.id); setConfirmId(null) }}
                >
                  {pet.profileImageUrl ? (
                    <img className="mypage-pet-thumb" src={pet.profileImageUrl} alt="" />
                  ) : (
                    <span className="mypage-pet-thumb mypage-pet-thumb-empty" aria-hidden="true">🐶</span>
                  )}
                  <span className="w-row-main">
                    <b>{pet.name}</b>
                    <span className="sub">
                      {[pet.breed ?? '품종 미입력', pet.birthDate ?? '생년월일 미입력'].join(' · ')}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="mypage-pet-actions">
                    {confirmId === pet.id ? (
                      /* 삭제 확인이 액션 줄을 통째로 대신한다 — 확인 중에 수정으로 이동하는
                         어긋난 조작을 막고, 좁은 줄에서 문구 자리도 확보된다 */
                      <DeleteConfirm
                        message={`${pet.name}을(를) 삭제할까요?`}
                        busy={deletingId === pet.id}
                        onConfirm={() => onDelete(pet)}
                        onCancel={() => setConfirmId(null)}
                      />
                    ) : (
                      <>
                        {/* 상세 진입 — /pets 목록 행에서 흡수 (2026-08-25) */}
                        <Link className="w-link" to={`/pets/${pet.id}`}>
                          상세
                        </Link>
                        <Link
                          className="w-link"
                          to={`/pets/${pet.id}/edit`}
                          state={{ from: RETURN_TO }}
                        >
                          수정
                        </Link>
                        {/* 삭제는 위험 액션 — 딥 레드 텍스트 (레드 채움 금지 규칙) */}
                        <button
                          type="button"
                          className="danger-link"
                          onClick={() => setConfirmId(pet.id)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
