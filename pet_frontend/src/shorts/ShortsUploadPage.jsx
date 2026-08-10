import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyPets } from '../pet/petApi'
import { createShorts, uploadVideoFile } from './shortsApi'
import '../member/member.css'
import './shortsUpload.css'

// 서버(ShortsCreateRequest)와 같은 규칙 — 최종 차단은 서버가 한다
const MIN_SEC = 5
const MAX_SEC = 30
const MAX_CAPTION = 500
// 주제 개수 상한은 서버(ShortsCreateRequest)와 같은 값 — 최종 차단은 서버가 한다
const MAX_TOPICS = 5

/*
 * 영상 주제 — 고정 목록 13종 (숏츠_태그_설계.md 2절).
 * 서버의 ShortsTopic enum과 같은 목록이며, 고치면 양쪽을 함께 고쳐야 한다.
 *
 * 자유 입력을 두지 않는 이유: 개인화 선호도는 태그 문자열이 정확히 같을 때만 합산되므로
 * ('귀여움'/'귀여워'/'큐트'가 서로 다른 태그가 된다) 목록을 닫아야 데이터가 모인다.
 * 나중에 LLM이 주제를 제안할 때도 이 목록 안에서만 고르게 강제한다(설계 6절).
 */
const TOPICS = [
  '일상/브이로그', '산책/야외/여행', '놀이', '먹방/간식', '미용',
  '훈련/교육', '건강/의료', '정보/리뷰',
  '귀여움', '개그/밈', '챌린지/트렌드', '감동/성장',
  '입양/구조',
]

/*
 * 캡션 키워드 → 주제 제안 사전 (설계 3절). 프론트에서 돌린다.
 *
 * ⚠️ 감성/포맷 주제(귀여움·개그/밈·챌린지/트렌드·감동/성장)는 키워드로 잘 안 잡힌다.
 * 구체적 명사가 아니라 분위기·형식이라 그렇다. 이런 건 제안이 약해도 사용자가 직접 켜면 되고,
 * 정확도가 필요하면 나중에 LLM이 잘 잡는다(설계 6절).
 */
const TOPIC_KEYWORDS = {
  // 설계 3절 사전에서 '같이'를 뺐다 — "친구랑 같이 밥"처럼 반려동물과 무관한 문장에도 걸린다
  '일상/브이로그': ['일상', '브이로그', 'vlog', '하루', '데일리', '집콕'],
  '산책/야외/여행': ['산책', '공원', '야외', '바깥', '여행', '나들이', '캠핑', '바다', '드라이브'],
  '놀이': ['놀이', '장난감', '공놀이', '노는', '터그', '물어와', '장난'],
  '먹방/간식': ['먹방', '간식', '밥', '사료', '급식', '수제간식', '먹었', '맛있'],
  '미용': ['미용', '목욕', '커트', '그루밍', '빗질', '발톱', '샴푸', '스타일'],
  '훈련/교육': ['훈련', '교육', '배변', '앉아', '기다려', '명령어', '사회화', '트레이닝', '짖'],
  /*
   * 설계 3절 사전의 '약'을 '투약'·'약 먹'으로 좁혔다. 한 글자 '약'은 '약속'·'예약'·'약간'에
   * 모두 걸려 오탐이 가장 많았다(실측). 나머지 10개 키워드가 충분히 넓어 손실은 거의 없다.
   */
  '건강/의료': ['병원', '수의사', '접종', '건강', '아파', '아픈', '치료', '투약', '약 먹', '검진', '수술', '증상'],
  '정보/리뷰': ['정보', '리뷰', '추천', '추천템', '언박싱', '후기', '꿀팁', '비교', '용품', '제품'],
  '귀여움': ['귀여', '귀엽', '심쿵', '애교', '사랑스', '치명적', '최애', '큐트'],
  '개그/밈': ['개그', '밈', '웃긴', '웃음', '짤', '웃겨', '실수', '웃픈', '드립'],
  '챌린지/트렌드': ['챌린지', '트렌드', '유행', '따라하기', 'challenge', '챌'],
  '감동/성장': ['감동', '성장', '무지개다리', '첫날', '한달', '크는', '자라', '뭉클', '추억', '사연'],
  '입양/구조': ['입양', '구조', '보호소', '유기', '임보', '임시보호', '후원'],
}

// 캡션을 스캔해 걸리는 주제를 모은다. 대소문자는 무시한다('vlog'/'VLOG')
function matchTopics(caption) {
  const text = caption.toLowerCase()
  return TOPICS.filter((topic) =>
    TOPIC_KEYWORDS[topic].some((keyword) => text.includes(keyword.toLowerCase()))
  )
}

// 캡션을 치는 중에는 제안을 미룬다 — 글자마다 칩이 튀면 방해가 된다 (설계 6절 주의 2)
const SUGGEST_DELAY_MS = 500
// 용량 상한은 가이드 7절의 미정 항목이라 우선 50MB로 둔다 (정해지면 서버 검증도 함께 추가)
const MAX_BYTES = 50 * 1024 * 1024
// mp4 전용 확정 (가이드 7절). 서버(ShortsService.uploadVideo)도 같은 값으로 최종 검사한다
const VIDEO_MIME = 'video/mp4'

// 피드 프레임 비율. 영상은 여기에 object-fit:cover로 들어가므로 남는 쪽이 잘려나간다
const FRAME_RATIO = 9 / 16
// 이 정도 이상 잘릴 때만 경고한다 (1~2% 차이까지 알릴 필요는 없다)
const CROP_WARN_THRESHOLD = 10

// 길이와 해상도를 파일을 올리기 전에 브라우저에서 미리 읽는다 (가이드 5절)
function readMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('영상 정보를 읽을 수 없습니다. mp4 파일인지 확인해 주세요.'))
    }
    video.src = url
  })
}

/**
 * 9:16 프레임에 cover로 넣을 때 잘려나가는 비율. 막지는 않고 미리 알려주기 위한 계산이다.
 * 영상이 프레임보다 가로로 넓으면 높이에 맞춰 확대되며 좌우가, 반대면 위아래가 잘린다.
 */
function cropInfo(width, height) {
  if (!width || !height) return null
  const ratio = width / height
  const visible = ratio > FRAME_RATIO ? FRAME_RATIO / ratio : ratio / FRAME_RATIO
  return {
    axis: ratio > FRAME_RATIO ? '좌우' : '위아래',
    percent: Math.round((1 - visible) * 100),
  }
}

export default function ShortsUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(null) // 초 단위 실수
  const [size, setSize] = useState(null) // { width, height }
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [topics, setTopics] = useState([])
  const [topicError, setTopicError] = useState('')
  const [topicNotice, setTopicNotice] = useState('')
  const [fileError, setFileError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [step, setStep] = useState('') // 진행 상황 안내 ('' = 대기)
  const [pets, setPets] = useState([]) // 내 반려동물 목록. 실패하거나 0마리면 빈 배열
  const [petIds, setPetIds] = useState([]) // 고른 반려동물 id들. 빈 배열 = 고르지 않음

  /*
   * 한 번이라도 제안했거나 사용자가 직접 누른 주제. 다시 제안하지 않기 위해 기억한다.
   *
   * 이게 없으면 이런 일이 벌어진다 — 캡션에 '산책'이 있어 칩이 켜지고, 사용자가 그걸 뺀 뒤
   * 캡션을 한 글자 더 치면 매칭이 다시 돌아 칩이 되살아난다. 사용자와 싸우는 UI가 된다.
   * 제안은 어디까지나 제안이고 최종 결정권은 사용자에게 있다(설계 4절).
   */
  const proposedRef = useRef(new Set())

  /*
   * 내 반려동물 목록. 실패해도 업로드를 막지 않는다 — 반려동물 선택은 선택 사항이라
   * 목록을 못 불러왔다고 영상까지 못 올리게 할 이유가 없다. 그 경우 선택란만 비어 보인다.
   */
  useEffect(() => {
    getMyPets()
      .then(setPets)
      .catch(() => setPets([]))
  }, [])

  // 미리보기용 blob URL은 다 쓰면 반드시 해제한다 (놔두면 메모리에 남는다)
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  /*
   * 캡션 → 주제 자동 제안 (설계 4절 2번 단계).
   *
   * 나중에 이 블록만 FastAPI LLM 호출로 바꾸면 된다 — 흐름(입력 → 제안 → 사용자 확인 → 제출)은
   * 그대로다(설계 6절). 그때는 실패해도 업로드를 막지 않도록 조용히 넘기고,
   * 여기 키워드 매칭을 폴백으로 남겨두면 된다.
   */
  useEffect(() => {
    if (!caption.trim()) return
    const timer = setTimeout(() => {
      const matched = matchTopics(caption)
      const fresh = matched.filter((topic) => !proposedRef.current.has(topic))
      matched.forEach((topic) => proposedRef.current.add(topic))
      if (fresh.length === 0) return

      setTopics((prev) => {
        const room = MAX_TOPICS - prev.length
        if (room <= 0) return prev
        const added = fresh.filter((topic) => !prev.includes(topic)).slice(0, room)
        return added.length === 0 ? prev : [...prev, ...added]
      })
      setTopicNotice('캡션을 보고 주제를 켜뒀습니다. 맞지 않으면 눌러서 빼세요.')
    }, SUGGEST_DELAY_MS)
    return () => clearTimeout(timer)
  }, [caption])

  const resetSelection = () => {
    setFile(null)
    setDuration(null)
    setSize(null)
    setPreviewUrl('')
  }

  const onFileChange = async (e) => {
    const selected = e.target.files?.[0]
    setFileError('')
    setSubmitError('')
    if (!selected) {
      resetSelection()
      return
    }

    // mp4만 허용. 브라우저마다 재생 가능한 코덱이 달라 포맷을 하나로 고정한다
    if (selected.type !== VIDEO_MIME) {
      resetSelection()
      setFileError('mp4 영상만 올릴 수 있습니다.')
      return
    }
    if (selected.size > MAX_BYTES) {
      resetSelection()
      setFileError(`파일이 너무 큽니다. ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`)
      return
    }

    let meta
    try {
      meta = await readMetadata(selected)
    } catch (err) {
      resetSelection()
      setFileError(err.message)
      return
    }

    const seconds = meta.duration
    if (!Number.isFinite(seconds)) {
      resetSelection()
      setFileError('영상 길이를 확인할 수 없습니다. 다른 파일로 시도해 주세요.')
      return
    }
    if (seconds < MIN_SEC || seconds > MAX_SEC) {
      resetSelection()
      setFileError(`${MIN_SEC}~${MAX_SEC}초 영상만 올릴 수 있습니다. (선택한 영상: ${seconds.toFixed(1)}초)`)
      return
    }

    // 비율은 막지 않는다 — 9:16이 아니어도 올릴 수 있고, 얼마나 잘리는지만 아래에서 알려준다
    setFile(selected)
    setDuration(seconds)
    setSize({ width: meta.width, height: meta.height })
    setPreviewUrl(URL.createObjectURL(selected))
  }

  // 칩을 누르면 켜고/끈다. 서버도 같은 상한을 보지만 바로 이유를 보여주려고 여기서 먼저 막는다
  const toggleTopic = (topic) => {
    setTopicNotice('')
    setTopicError('')
    // 직접 만진 주제는 다시 제안하지 않는다 (빼자마자 되살아나는 것을 막는다)
    proposedRef.current.add(topic)

    if (topics.includes(topic)) {
      setTopics(topics.filter((t) => t !== topic))
      return
    }
    if (topics.length >= MAX_TOPICS) {
      setTopicError(`주제는 ${MAX_TOPICS}개까지 고를 수 있습니다.`)
      return
    }
    setTopics([...topics, topic])
  }

  // 여러 마리를 고를 수 있다 — 한 영상에 두 마리가 함께 나오는 경우가 흔하다
  const togglePet = (id) => {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!file || duration === null) {
      setFileError('올릴 영상을 선택해 주세요.')
      return
    }

    try {
      // 1) 파일을 백엔드로 보내면 백엔드가 Storage에 넣고 공개 URL을 돌려준다
      setStep('영상을 올리는 중…')
      const { videoUrl } = await uploadVideoFile(file)

      // 2) 받은 URL과 정보를 등록
      setStep('정보를 저장하는 중…')
      await createShorts({
        petIds,
        videoUrl,
        thumbnailUrl: null, // 썸네일 생성은 나중 단계
        caption: caption.trim() || null,
        // 고른 주제가 없으면 null — 서버도 빈 배열을 NULL로 통일한다
        topics: topics.length > 0 ? topics : null,
        durationSec: Math.round(duration),
      })

      // 피드가 다시 마운트되며 목록을 새로 불러온다. 방금 올린 영상은 거기 없다 —
      // 피드는 내가 올린 영상을 빼고 보여준다 (ShortsRepository.findPersonalizedRankedIds)
      navigate('/shorts', { replace: true })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setStep('')
    }
  }

  // Storage 설정은 서버(.env)에만 있으므로 프론트에서 미리 확인할 수 없다.
  // 설정이 빠져 있으면 업로드 요청 시 서버가 이유를 담은 메시지를 돌려주고, submitError로 표시된다
  const submitting = step !== ''
  const crop = size ? cropInfo(size.width, size.height) : null
  /*
   * 고른 반려동물들의 품종 — 서버가 tags에 붙일 값과 같아야 하므로 서버와 같은 규칙으로 만든다.
   * 빈 품종은 빼고, 같은 품종을 여러 마리 골랐으면 하나로 합친다 (ShortsService.toTags).
   */
  const autoTags = [
    ...new Set(
      pets
        .filter((pet) => petIds.includes(pet.id))
        .map((pet) => pet.breed?.trim())
        .filter(Boolean)
    ),
  ]

  return (
    <main className="auth-page">
      <h1>숏츠 올리기</h1>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label>
          영상 파일 (mp4, {MIN_SEC}~{MAX_SEC}초, {Math.floor(MAX_BYTES / 1024 / 1024)}MB 이하)
          <input
            type="file"
            accept="video/mp4"
            onChange={onFileChange}
            disabled={submitting}
            aria-invalid={Boolean(fileError)}
          />
          {fileError && <p className="field-error">{fileError}</p>}
        </label>

        {previewUrl && (
          <div className="su-preview">
            {/* 9:16 세로 프레임에서 어떻게 보일지 미리 확인 — 피드와 같은 잘림(cover)을 적용 */}
            <video src={previewUrl} muted loop playsInline autoPlay />
            <p className="su-meta">
              {size && `${size.width}×${size.height} · `}
              {duration.toFixed(1)}초 · {(file.size / 1024 / 1024).toFixed(1)}MB
            </p>
            {crop && crop.percent >= CROP_WARN_THRESHOLD && (
              <p className="su-crop-warn">
                9:16 세로 비율이 아니라 <strong>{crop.axis}가 약 {crop.percent}% 잘립니다.</strong>
                <br />
                위 미리보기가 피드에서 보일 모습 그대로입니다. 그대로 올려도 됩니다.
              </p>
            )}
          </div>
        )}

        <label>
          설명 (선택)
          <input
            type="text"
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => setCaption(e.target.value)}
            disabled={submitting}
            placeholder="예: 산책 나온 우리 강아지 🐾"
          />
        </label>

        {/* 반려동물이 0마리면 묶음 자체를 감춘다 — 고를 것이 없는 빈 목록은 방해만 된다.
            등록하러 가는 링크만 안내하고, 그대로 영상을 올릴 수 있다 (선택 사항).
            label이 아니라 fieldset인 이유는 주제 칩과 같다 — 대상이 여럿이라 label 하나가
            가리킬 곳이 없다 */}
        {pets.length > 0 ? (
          <fieldset className="su-tags">
            <legend>주인공 반려동물 (선택 · {petIds.length}/{pets.length})</legend>
            <p className="su-tags-hint">
              여러 마리를 고를 수 있습니다. 고른 반려동물의 품종이 태그로 함께 저장됩니다.
            </p>

            <ul className="su-tag-list">
              {pets.map((pet) => {
                const on = petIds.includes(pet.id)
                return (
                  <li key={pet.id}>
                    <button
                      type="button"
                      className={on ? 'su-tag su-tag-on' : 'su-tag'}
                      onClick={() => togglePet(pet.id)}
                      disabled={submitting}
                      aria-pressed={on}
                    >
                      {pet.name}
                      {pet.breed ? ` (${pet.breed})` : ''}
                      {on && <span aria-hidden="true">×</span>}
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* 어떤 태그가 붙을지 미리 보여준다 — 올리고 나서 모르는 태그가 생겼다고 느끼지 않게 */}
            {autoTags.length > 0 && (
              <p className="su-tags-notice">
                품종 <strong>{autoTags.join(', ')}</strong>이(가) 태그로 함께 저장됩니다.
              </p>
            )}
            {petIds.length > 0 && autoTags.length === 0 && (
              <p className="su-tags-hint">
                고른 반려동물에 품종이 없어 자동으로 붙는 태그가 없습니다.{' '}
                <Link to={`/pets/${petIds[0]}/edit`}>품종 입력하기</Link>
              </p>
            )}
          </fieldset>
        ) : (
          <p className="su-tags-hint">
            등록한 반려동물이 없습니다. <Link to="/pets/new">반려동물을 등록</Link>하면
            영상의 주인공을 고르고 품종이 태그로 자동 저장됩니다.
          </p>
        )}

        {/* label로 감싸지 않는다 — 선택 대상이 13개라 label 하나가 가리킬 대상이 없다.
            대신 fieldset/legend로 묶어 스크린리더에도 하나의 묶음으로 읽히게 한다 */}
        <fieldset className="su-tags">
          <legend>
            주제 (선택 · {topics.length}/{MAX_TOPICS})
          </legend>
          <p className="su-tags-hint">
            이 주제를 좋아하는 사람의 피드에 더 자주 보입니다. 없어도 올릴 수 있습니다.
            <br />
            설명을 쓰면 어울리는 주제를 자동으로 켜드립니다.
          </p>

          {/* 켜진 것과 꺼진 것을 한 목록에 두고 색으로 구분한다 — 목록이 13개로 고정이라
              선택 여부로 칩이 자리를 옮기면 누르려던 칩이 이동해 오히려 헷갈린다 */}
          <ul className="su-tag-list">
            {TOPICS.map((topic) => {
              const on = topics.includes(topic)
              return (
                <li key={topic}>
                  <button
                    type="button"
                    className={on ? 'su-tag su-tag-on' : 'su-tag'}
                    onClick={() => toggleTopic(topic)}
                    disabled={submitting}
                    aria-pressed={on}
                  >
                    {topic}
                    {on && <span aria-hidden="true">×</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          {topicNotice && <p className="su-tags-notice">{topicNotice}</p>}
          {topicError && <p className="field-error">{topicError}</p>}
        </fieldset>

        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting || !file}>
          {submitting ? step : '올리기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/shorts">← 숏츠로</Link>
      </p>
    </main>
  )
}
