import { useState } from 'react'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { useAuth } from './AuthContext'
import { updateMyName, uploadMyImage } from './memberApi'

// 마이페이지 — 내 정보 탭 (프로필 사진 + 이름 수정). 레이아웃·분리 배경은 MyPage.jsx 주석 참조
export default function MyPageProfile() {
  const { user, updateUser } = useAuth()

  // 프로필 사진 — pet 상세와 같은 흐름 (검증 규칙도 서버 ImageStorageClient와 동일)
  const [photoError, setPhotoError] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)

  const onPhotoChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setPhotoError('')
    setPhotoUploading(true)
    try {
      // 형식·용량 검증 + 512px 축소 (common/imageUpload — pet 화면들과 같은 규칙)
      const prepared = await prepareImage(file)
      updateUser(await uploadMyImage(prepared)) // 전역 user 갱신 — ?v= 덕에 즉시 새 이미지
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // 이름 수정 — 성공 시 updateUser로 전역 상태를 맞춰 홈의 "OO님" 표시도 함께 갱신된다
  const [name, setName] = useState(user.name)
  const [nameError, setNameError] = useState('')
  const [nameNotice, setNameNotice] = useState('')
  const [nameSubmitting, setNameSubmitting] = useState(false)

  const onNameSubmit = async (e) => {
    e.preventDefault()
    setNameNotice('')
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('이름은 필수입니다.')
      return
    }
    if (trimmed.length > 50) {
      setNameError('이름은 50자 이하여야 합니다.')
      return
    }
    setNameError('')
    setNameSubmitting(true)
    try {
      const updated = await updateMyName({ name: trimmed })
      updateUser(updated)
      setName(updated.name)
      setNameNotice('이름이 변경되었습니다.')
    } catch (err) {
      setNameError(err.message)
    } finally {
      setNameSubmitting(false)
    }
  }

  return (
    <section className="my-info">
      <h2>내 정보</h2>
      <div className="profile-photo">
        {user.profileImageUrl ? (
          <img src={user.profileImageUrl} alt="내 프로필 사진" />
        ) : (
          <div className="profile-photo-placeholder" aria-hidden="true">👤</div>
        )}
        <label className="profile-photo-upload">
          {photoUploading ? '업로드 중…' : user.profileImageUrl ? '사진 변경' : '사진 등록'}
          <input
            type="file" accept={IMAGE_ACCEPT}
            onChange={onPhotoChange} disabled={photoUploading}
          />
        </label>
      </div>
      {photoError && <p className="submit-error">{photoError}</p>}
      <dl>
        <div>
          <dt>이메일</dt>
          {/* 소셜 계정은 이메일 미동의 시 null (api-spec.md 1절 4차) */}
          <dd>{user.email ?? '미제공 (카카오 계정)'}</dd>
        </div>
      </dl>
      <form className="auth-form" onSubmit={onNameSubmit} noValidate>
        <label>
          이름
          <input
            type="text" name="name" value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(nameError)} autoComplete="name"
          />
          {nameError && <p className="field-error">{nameError}</p>}
        </label>
        {nameNotice && <p className="notice">{nameNotice}</p>}
        <button type="submit" disabled={nameSubmitting}>
          {nameSubmitting ? '저장 중…' : '이름 저장'}
        </button>
      </form>
    </section>
  )
}
