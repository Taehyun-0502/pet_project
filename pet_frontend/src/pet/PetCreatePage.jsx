import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../common/Field'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { useForm } from '../common/useForm'
import { registerPet, uploadPetImage } from './petApi'
import { today, toPetRequest, validatePetForm } from './petForm'
import '../common/forms.css'
import '../common/warm.css' // 웜톤 공용 토큰·클래스 + 라벨 노출형 폼 스킨 (pet.css보다 먼저)
import './pet.css'

export default function PetCreatePage() {
  const navigate = useNavigate()

  // 사진은 등록과 동시에 올릴 수 없다 — 업로드 API가 petId를 요구하기 때문(POST /api/pets/{petId}/image).
  // 그래서 선택 시점에는 파일만 준비해 두고, 제출 후 생성된 id로 이어서 올린다 (2026-08-11)
  const [photo, setPhoto] = useState(null) // 축소까지 끝난 업로드용 파일
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [preparing, setPreparing] = useState(false)

  // 미리보기 objectURL 해제 — 교체·이탈 때 정리하지 않으면 메모리에 남는다
  useEffect(() => {
    if (!photoPreview) return undefined
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const form = useForm({
    initialValues: { name: '', breed: '', birthDate: '' },
    validate: validatePetForm,
    onSubmit: async (values) => {
      const pet = await registerPet(toPetRequest(values))
      if (photo) {
        try {
          await uploadPetImage(pet.id, photo)
        } catch (err) {
          // 등록은 이미 성공했다 — 되돌리지 않고 상세로 보내 사진만 다시 시도하게 한다.
          // 입력한 정보를 사진 실패 때문에 잃는 것이 더 나쁘다
          navigate(`/pets/${pet.id}`, {
            replace: true,
            state: { photoError: `등록은 완료됐지만 사진 등록에 실패했습니다: ${err.message}` },
          })
          return
        }
      }
      // /pets 목록 폐지(2026-08-25) 후 목록 역할은 마이페이지 펫 탭이 맡는다
      navigate('/mypage/pets', { replace: true }) // 탭이 다시 마운트되며 새 데이터를 불러온다
    },
  })

  const onPhotoChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setPhotoError('')
    setPreparing(true)
    try {
      // 형식·용량 검증과 512px 축소 (common/imageUpload) — 상세·마이페이지와 같은 규칙
      const prepared = await prepareImage(file)
      setPhoto(prepared)
      setPhotoPreview(URL.createObjectURL(prepared))
    } catch (err) {
      setPhoto(null)
      setPhotoPreview('')
      setPhotoError(err.message)
    } finally {
      setPreparing(false)
    }
  }

  return (
    // .warm .auth-page 폼 스킨은 자손 셀렉터라 main.warm > div.auth-page 구조여야 한다 (pet.css 주석 참조)
    <main className="warm">
      <div className="auth-page">
      <h1>반려동물 등록</h1>
      <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
        {/* 사진은 선택 — 등록하지 않으면 목록·상세에 크림 배경 placeholder(🐶)가 표시된다 */}
        <div className="pet-photo">
          {photoPreview ? (
            <img src={photoPreview} alt="선택한 사진 미리보기" />
          ) : (
            <div className="pet-photo-placeholder" aria-hidden="true">🐶</div>
          )}
          <label className="pet-photo-upload">
            {preparing ? '불러오는 중…' : photo ? '사진 변경' : '사진 등록 (선택)'}
            <input
              type="file" accept={IMAGE_ACCEPT}
              onChange={onPhotoChange} disabled={preparing || form.submitting}
            />
          </label>
        </div>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
        <Field form={form} name="name" label="이름 (필수)" type="text" />
        <Field form={form} name="breed" label="품종 (선택)" type="text" placeholder="예: 푸들" />
        <Field form={form} name="birthDate" label="생년월일 (선택)" type="date" max={today()} />
        {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
        <button type="submit" className="w-cta block" disabled={form.submitting || preparing}>
          {form.submitting ? '등록 중…' : '등록하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/mypage/pets">← 펫 목록으로</Link>
      </p>
      </div>
    </main>
  )
}
