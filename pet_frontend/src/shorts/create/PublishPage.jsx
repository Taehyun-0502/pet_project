/*
 * ④ 발행 페이지. (가이드 6절)
 *
 * 캡션·반려동물·주제를 채우고 [쇼츠 만들기]를 누르면 **이때 처음으로** 영상이 Storage로 올라간다.
 * 앞 세 페이지는 브라우저 메모리에만 들고 있었다(가이드 0절).
 *
 * **지금 빠져 있는 것** (가이드 10절 5단계):
 *   · 캡션 위 작은 썸네일 + 썸네일 정하기 시트(필름스트립·썸네일 전용 텍스트·커버 굽기)
 *   · 트림 구간·크롭·볼륨·영상 위 텍스트 전송 — 해당 DB 칼럼이 아직 없다
 * 그래서 지금은 기존 API가 받는 필드만 보낸다. 필드를 늘릴 때 DDL을 함께 적용해야 한다
 * (스키마는 Supabase에서 수동 관리 — ddl-auto=none).
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyPets } from '../../pet/petApi'
import { cropMediaStyle, cropPanStyle, isDefaultCrop } from '../cropFrame'
import { createShorts, uploadThumbnailFile, uploadVideoFile } from '../shortsApi'
import { MAX_TOPICS, SUGGEST_DELAY_MS, TOPICS, matchTopics } from '../topics'
import { bakeThumbnail } from './bakeThumbnail'
import ThumbnailSheet from './ThumbnailSheet'

const MAX_CAPTION = 500

export default function PublishPage({ draft, patchDraft, goBack }) {
  const navigate = useNavigate()
  const [pets, setPets] = useState([])
  const [topicError, setTopicError] = useState('')
  const [topicNotice, setTopicNotice] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [step, setStep] = useState('') // 진행 상황 안내 ('' = 대기)
  const [thumbOpen, setThumbOpen] = useState(false)

  const submitting = step !== ''

  /*
   * 한 번이라도 제안했거나 사용자가 직접 누른 주제. 다시 제안하지 않기 위해 기억한다.
   * 이게 없으면 사용자가 뺀 칩이 캡션을 한 글자 더 칠 때마다 되살아나 UI가 사용자와 싸운다
   * (숏츠_태그_설계.md 4절 — 최종 결정권은 사용자에게 있다).
   */
  const proposedRef = useRef(new Set())

  // 작은 미리보기는 커버로 구워질 시점에 멈춰 세운다
  const previewRef = useRef(null)
  const seekToCoverTime = () => {
    if (previewRef.current) previewRef.current.currentTime = draft.thumbnailTimeSec
  }
  // 커버 시점이 바뀌면(시트에서 스크럽) 작은 미리보기도 따라간다
  useEffect(() => {
    const video = previewRef.current
    if (video && video.readyState >= 2) video.currentTime = draft.thumbnailTimeSec
  }, [draft.thumbnailTimeSec])

  /*
   * 제안 타이머가 읽을 "지금의 주제 목록". 타이머는 캡션이 바뀔 때 걸리고 500ms 뒤에 터지는데,
   * 그 사이 사용자가 칩을 눌렀으면 렌더 시점에 가둔 draft.topics는 이미 옛 값이다.
   * 그대로 덮어쓰면 방금 뺀 주제가 되살아난다 — 제안이 사용자와 싸우게 된다(설계 4절).
   */
  const topicsRef = useRef(draft.topics)
  topicsRef.current = draft.topics

  /*
   * 내 반려동물 목록. 실패해도 업로드를 막지 않는다 — 반려동물 선택은 선택 사항이라
   * 목록을 못 불러왔다고 영상까지 못 올리게 할 이유가 없다.
   */
  useEffect(() => {
    getMyPets()
      .then(setPets)
      .catch(() => setPets([]))
  }, [])

  // 캡션 → 주제 자동 제안 (설계 4절 2번 단계). 나중에 이 블록만 LLM 호출로 바꾸면 된다
  useEffect(() => {
    if (!draft.caption.trim()) return
    const timer = setTimeout(() => {
      const matched = matchTopics(draft.caption)
      const fresh = matched.filter((topic) => !proposedRef.current.has(topic))
      matched.forEach((topic) => proposedRef.current.add(topic))
      if (fresh.length === 0) return

      const current = topicsRef.current
      const room = MAX_TOPICS - current.length
      if (room <= 0) return
      const added = fresh.filter((topic) => !current.includes(topic)).slice(0, room)
      if (added.length === 0) return

      // 쓸 때도 직전 값 기준으로 합친다 — 읽은 순간과 쓰는 순간 사이가 벌어질 수 있다
      patchDraft((prev) => ({
        topics: [...prev.topics, ...added.filter((topic) => !prev.topics.includes(topic))],
      }))
      setTopicNotice('캡션을 보고 주제를 켜뒀습니다. 맞지 않으면 눌러서 빼세요.')
    }, SUGGEST_DELAY_MS)
    return () => clearTimeout(timer)
    // 제안이 필요한 시점은 "캡션이 바뀌었을 때"뿐이다. 나머지 값은 ref로 최신을 읽으므로
    // 의존성에 넣을 필요가 없고, patchDraft는 매 렌더 새로 만들어져 넣으면 타이머가 계속 다시 걸린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.caption])

  const toggleTopic = (topic) => {
    setTopicNotice('')
    setTopicError('')
    // 직접 만진 주제는 다시 제안하지 않는다 (빼자마자 되살아나는 것을 막는다)
    proposedRef.current.add(topic)

    if (draft.topics.includes(topic)) {
      patchDraft({ topics: draft.topics.filter((t) => t !== topic) })
      return
    }
    if (draft.topics.length >= MAX_TOPICS) {
      setTopicError(`주제는 ${MAX_TOPICS}개까지 고를 수 있습니다.`)
      return
    }
    patchDraft({ topics: [...draft.topics, topic] })
  }

  // 여러 마리를 고를 수 있다 — 한 영상에 두 마리가 함께 나오는 경우가 흔하다
  const togglePet = (id) => {
    patchDraft({
      petIds: draft.petIds.includes(id)
        ? draft.petIds.filter((v) => v !== id)
        : [...draft.petIds, id],
    })
  }

  /*
   * 고른 반려동물들의 품종 — 서버가 tags에 붙일 값과 같은 규칙으로 미리 보여준다
   * (빈 품종 제외, 중복 합침 — ShortsService.toTags).
   */
  const autoTags = [
    ...new Set(
      pets
        .filter((pet) => draft.petIds.includes(pet.id))
        .map((pet) => pet.breed?.trim())
        .filter(Boolean)
    ),
  ]

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!draft.videoFile) {
      setSubmitError('영상이 없습니다. 처음으로 돌아가 다시 골라주세요.')
      return
    }

    try {
      /*
       * 1) 커버를 굽는다. 시트를 한 번도 열지 않았어도 굽는다 — 기본값이 "구간 첫 프레임"이라
       *    아무것도 안 해도 커버가 생긴다(가이드 6절).
       *
       *    실패해도 그냥 넘어간다. 커버가 없으면 피드가 영상 첫 프레임을 쓰므로,
       *    커버 하나 때문에 발행 전체를 막을 이유가 없다.
       */
      setStep('커버를 만드는 중…')
      const cover = await bakeThumbnail(draft.videoUrl, {
        timeSec: draft.thumbnailTimeSec,
        overlays: draft.thumbnailTextOverlays,
        crop: draft.crop,
        size: draft.size,
      })

      // 2) 파일을 백엔드로 보내면 백엔드가 Storage에 넣고 공개 URL을 돌려준다
      setStep('영상을 올리는 중…')
      const { videoUrl } = await uploadVideoFile(draft.videoFile)

      let thumbnailUrl = null
      if (cover) {
        setStep('커버를 올리는 중…')
        // 여기서도 실패를 삼킨다 — 영상은 이미 올라갔고, 커버 없이도 정상적으로 발행된다
        thumbnailUrl = await uploadThumbnailFile(cover)
          .then((res) => res.thumbnailUrl)
          .catch(() => null)
      }

      // 3) 받은 URL과 정보를 등록. 응답은 그대로 피드로 넘겨 방금 올린 영상을 보여준다
      setStep('정보를 저장하는 중…')
      const created = await createShorts({
        petIds: draft.petIds,
        videoUrl,
        thumbnailUrl,
        caption: draft.caption.trim() || null,
        // 고른 주제가 없으면 null — 서버도 빈 배열을 NULL로 통일한다
        topics: draft.topics.length > 0 ? draft.topics : null,
        durationSec: Math.round(draft.trimEnd - draft.trimStart),
        /*
         * ③에서 정한 소리·글자.
         *
         * muteOriginal은 videoVolume에서 끌어낸다 — 두 값이 어긋나면("볼륨 70인데 음소거")
         * 재생 쪽이 어느 쪽을 믿어야 할지 알 수 없다. 서버도 같은 규칙으로 한 번 더 맞춘다.
         * 곡을 안 골랐으면 시작점도 0으로 눌러 보낸다.
         */
        musicKey: draft.musicKey || null,
        muteOriginal: draft.videoVolume === 0,
        musicStartSec: draft.musicKey ? draft.musicStartSec : 0,
        musicVolume: draft.musicVolume,
        videoVolume: draft.videoVolume,
        /*
         * id는 화면에서만 쓰는 값이라 빼고 보낸다 — 저장 모양은 { text, top, left }다.
         * 빈 글자는 걸러낸다: ③에서 글자를 지워 비워둔 채로 넘어올 수 있는데,
         * 그대로 보내면 서버 @NotBlank에 걸려 400이 된다
         */
        overlayTexts: draft.textOverlays
          .map(({ text, top, left, color, size, rotate }) => ({
            text: text.trim(),
            top,
            left,
            color,
            size,
            rotate,
          }))
          .filter((item) => item.text),
        /*
         * ②에서 정한 재생 구간과 9:16 위치. 영상 파일은 원본 그대로 올라가고 재생 쪽이
         * 이 값으로 구간·위치를 맞춘다 (가이드 4절 방법 A).
         * crop은 손대지 않았으면 null로 보낸다 — 서버도 기본값을 NULL로 눌러 저장한다
         */
        trimStartSec: draft.trimStart,
        trimEndSec: draft.trimEnd,
        crop: isDefaultCrop(draft.crop) ? null : draft.crop,
        /*
         * 커버는 이미 이미지로 구워졌지만 시점·글자도 함께 보낸다 — 나중에 다시 구우려면
         * "무엇으로 구웠는지"가 남아 있어야 한다(구운 이미지만으로는 알 수 없다).
         */
        thumbnailTimeSec: draft.thumbnailTimeSec,
        thumbnailTextOverlays: draft.thumbnailTextOverlays
          .map(({ text, top, left, color, size, rotate }) => ({
            text: text.trim(),
            top,
            left,
            color,
            size,
            rotate,
          }))
          .filter((item) => item.text),
      })

      /*
       * 방금 올린 영상을 피드로 실어 보낸다. 피드는 내가 올린 영상을 빼고 보여주므로
       * (ShortsRepository의 랭킹 쿼리) 그냥 넘어가면 올린 결과를 한 번도 못 본다.
       */
      navigate('/shorts', { replace: true, state: { justUploaded: created } })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setStep('')
    }
  }

  return (
    <form className="sc-page sc-publish" onSubmit={onSubmit} noValidate>
      <header className="sc-bar">
        <button
          type="button"
          className="sc-back"
          onClick={goBack}
          disabled={submitting}
          aria-label="이전 단계로"
        >
          ←
        </button>
        <span className="sc-title">제작 마무리</span>
        <span className="sc-bar-spacer" aria-hidden="true" />
      </header>

      {/*
        커버 정하기 시트가 열려 있는 동안에는 폼을 감춘다 (2026-08-26 — 두 화면 모두
        스크롤 없이 보이게 하기 위함). 둘을 함께 두면 폼 + 큰 커버 시트 + 올리기 버튼이
        한 화면에 다 들어가지 않아 결국 스크롤이 생긴다. ③ 편집(EditPage)도 시트가 열리면
        같은 방식으로 안내 패널을 감춘다.
        캡션 등 입력값은 draft에 있으므로 언마운트해도 사라지지 않는다.
      */}
      {!thumbOpen && (
      <div className="sc-publish-body">
        {/* 썸네일 자리. 5단계에서 누르면 썸네일 정하기 시트가 뜨고, 기본값은 맨 앞 프레임이다.
            지금은 영상 미리보기를 작게 보여줘 "무엇에 대한 설명인지"만 알 수 있게 한다 */}
        <div className="sc-publish-head">
          {/*
            커버 미리보기 겸 진입점. 누르면 커버 정하기 시트가 열린다.
            움직이는 영상이 아니라 **고른 시점에 멈춘 화면**을 보여준다 — 이게 커버로 구워질
            그림이고, 재생되고 있으면 어느 장면이 커버인지 알 수 없다.
          */}
          <button
            type="button"
            className="sc-thumb"
            onClick={() => setThumbOpen(true)}
            disabled={submitting}
            aria-label="커버 정하기"
          >
            <div className="crop-pan" style={cropPanStyle(draft.crop)}>
              <video
                ref={previewRef}
                className="crop-media"
                style={cropMediaStyle(draft.crop, draft.size)}
                src={draft.videoUrl}
                muted
                playsInline
                preload="auto"
                onLoadedData={seekToCoverTime}
              />
            </div>
            {/* 커버 전용 글자. 영상 자막(textOverlays)은 여기 그리지 않는다 —
                커버에는 박히지 않는 값이라, 그리면 구워진 결과와 달라진다 */}
            {draft.thumbnailTextOverlays.map((item) => (
              <div
                key={item.id}
                className="sc-cover-text"
                style={{
                  top: `${item.top}%`,
                  left: `${item.left}%`,
                  color: item.color,
                  '--ov-size': item.size ?? 1,
                  '--ov-rotate': `${item.rotate ?? 0}deg`,
                }}
              >
                {item.text}
              </div>
            ))}
            <span className="sc-thumb-badge" aria-hidden="true">
              커버 ›
            </span>
          </button>
          <label className="sc-caption">
            <span>내용 (선택)</span>
            <textarea
              value={draft.caption}
              maxLength={MAX_CAPTION}
              onChange={(e) => patchDraft({ caption: e.target.value })}
              disabled={submitting}
              placeholder="예: 산책 나온 우리 강아지 🐾"
              rows={3}
            />
          </label>
        </div>

        {/* 반려동물이 0마리면 묶음 자체를 감춘다 — 고를 것이 없는 빈 목록은 방해만 된다 */}
        {pets.length > 0 ? (
          <fieldset className="sc-field">
            <legend>주인공 반려동물 (선택 · {draft.petIds.length}/{pets.length})</legend>
            <p className="sc-note">
              여러 마리를 고를 수 있습니다. 고른 반려동물의 품종이 태그로 함께 저장됩니다.
            </p>
            <ul className="sc-chips">
              {pets.map((pet) => {
                const on = draft.petIds.includes(pet.id)
                return (
                  <li key={pet.id}>
                    <button
                      type="button"
                      className={on ? 'sc-chip sc-chip-on' : 'sc-chip'}
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
            {autoTags.length > 0 && (
              <p className="sc-notice">
                품종 <strong>{autoTags.join(', ')}</strong>이(가) 태그로 함께 저장됩니다.
              </p>
            )}
          </fieldset>
        ) : (
          <p className="sc-note">
            등록한 반려동물이 없습니다. <Link to="/pets/new">반려동물을 등록</Link>하면
            영상의 주인공을 고르고 품종이 태그로 자동 저장됩니다.
          </p>
        )}

        {/* label로 감싸지 않는다 — 선택 대상이 14개라 label 하나가 가리킬 대상이 없다 */}
        <fieldset className="sc-field">
          <legend>주제 (선택 · {draft.topics.length}/{MAX_TOPICS})</legend>
          <p className="sc-note">
            이 주제를 좋아하는 사람의 피드에 더 자주 보입니다. 없어도 올릴 수 있습니다.
          </p>
          {/* 켜진 것과 꺼진 것을 한 목록에 두고 색으로만 구분한다 — 목록이 고정이라
              선택 여부로 칩이 자리를 옮기면 누르려던 칩이 이동해 오히려 헷갈린다 */}
          <ul className="sc-chips">
            {TOPICS.map((topic) => {
              const on = draft.topics.includes(topic)
              return (
                <li key={topic}>
                  <button
                    type="button"
                    className={on ? 'sc-chip sc-chip-on' : 'sc-chip'}
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
          {topicNotice && <p className="sc-notice">{topicNotice}</p>}
          {topicError && <p className="sc-error">{topicError}</p>}
        </fieldset>

        {/* 올리기 버튼 바로 위에 둔다 — 위에 두면 주제를 고르는 동안 화면 밖으로 밀려
            정작 제출하는 순간에는 보이지 않는다. 피드의 신고 사유(저작권 침해)와 짝이다 */}
        <p className="sc-copyright">
          영상에 사용한 <strong>음원의 저작권은 업로더 본인의 책임</strong>입니다.
          권리자의 허락 없이 음원·영상을 사용하면 저작권 침해로 신고될 수 있고,
          확인되면 영상이 삭제될 수 있습니다.
        </p>

        {submitError && <p className="sc-error">{submitError}</p>}
      </div>
      )}

      {thumbOpen && (
        <ThumbnailSheet draft={draft} patchDraft={patchDraft} onClose={() => setThumbOpen(false)} />
      )}

      <div className="sc-publish-foot">
        <button type="submit" className="sc-submit" disabled={submitting}>
          {submitting ? step : '쇼츠 만들기'}
        </button>
      </div>
    </form>
  )
}
