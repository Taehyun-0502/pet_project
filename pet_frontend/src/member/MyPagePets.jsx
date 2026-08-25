import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deletePet, getMyPets } from '../pet/petApi'
// pet.css를 빌려 쓰지 않는다 (2026-08-25 Modernist 전환) — pet 화면은 다른 작업자와 동시 작업
// 중이라, 이 탭의 행·액션 스타일은 member.css에 자체 정의했다 (.mypage-pet-* 계열)
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
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    getMyPets()
      .then((list) => { if (!cancelled) setPets(list) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  const onDelete = async (pet) => {
    // 상세 화면과 같은 문구 — 같은 동작에 다른 경고가 뜨면 어느 쪽이 진짜인지 헷갈린다
    if (!window.confirm(`${pet.name}을(를) 삭제할까요? 목록에서 사라집니다.`)) return
    setError('')
    setDeletingId(pet.id)
    try {
      await deletePet(pet.id)
      // 로컬 배열에서 빼지 않고 서버를 다시 읽는다 — 다른 탭·기기의 변경과 화면이 어긋나지 않게
      // (보안 탭의 기기 원격 로그아웃과 같은 방식)
      setPets(await getMyPets())
      setOpenId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section>
      <h2>펫 정보</h2>
      <nav className="mypage-pets-nav">
        <Link className="mn-link" to="/pets/new">+ 반려동물 등록</Link>
      </nav>
      <p className="muted-note">항목을 누르면 상세·수정·삭제할 수 있습니다.</p>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {pets === null && !error && <p className="muted-note">불러오는 중…</p>}
      {pets && pets.length === 0 && (
        <p className="muted-note">등록된 반려동물이 없습니다. 위 버튼으로 등록해 보세요.</p>
      )}
      {pets && pets.length > 0 && (
        <ul className="mypage-pet-list">
          {pets.map((pet) => {
            const open = openId === pet.id
            return (
              <li key={pet.id}>
                {/* 항목은 <button> — li에 onClick을 걸면 키보드로 접근할 수 없다.
                    홈 목록이 <Link>인 것과 대비되는데, 여기서는 이동이 아니라 펼침이라 버튼이 맞다 */}
                <button
                  type="button"
                  className="mn-row"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : pet.id)}
                >
                  {pet.profileImageUrl ? (
                    <img className="mypage-pet-thumb" src={pet.profileImageUrl} alt="" />
                  ) : (
                    <span className="mypage-pet-thumb mn-photo" aria-hidden="true" />
                  )}
                  <span>
                    <b>{pet.name}</b>
                    <span className="sub">
                      {[pet.breed ?? '품종 미입력', pet.birthDate ?? '생년월일 미입력'].join(' · ')}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="mypage-pet-actions">
                    {/* 상세 진입 — /pets 목록 행에서 흡수 (2026-08-25) */}
                    <Link className="mn-link" to={`/pets/${pet.id}`}>
                      상세
                    </Link>
                    <Link
                      className="mn-link"
                      to={`/pets/${pet.id}/edit`}
                      state={{ from: RETURN_TO }}
                    >
                      수정
                    </Link>
                    {/* 삭제는 위험 액션 — 딥 레드 텍스트 (레드 채움 금지 규칙) */}
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => onDelete(pet)}
                      disabled={deletingId === pet.id}
                    >
                      {deletingId === pet.id ? '삭제 중…' : '삭제'}
                    </button>
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
