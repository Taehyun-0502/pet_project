/*
 * 숏츠 만들기 — 4페이지 풀스크린 플로우의 부모. (숏츠_제작_플로우_구조_가이드.md 1·2·9절)
 *
 *   ① 카메라   촬영하거나 파일 고르기        → videoFile
 *   ② 길이/비율 트리밍 + 9:16 맞추기          → trimStart·trimEnd·crop
 *   ③ 편집     사운드·텍스트·볼륨            → musicKey·textOverlays·volume
 *   ④ 발행     캡션·반려동물·주제 → 업로드
 *
 * **핵심**: 페이지마다 영상 파일을 새로 만들지 않는다. draft 하나에 설정만 쌓아가다가 ④에서
 * 한 번에 올린다. 영상은 무거우므로 마지막까지 브라우저 메모리에만 둔다(가이드 0절).
 *
 * ── 지금 구현된 범위 (가이드 10절 1단계) ────────────────────────────────
 *   ① 파일 선택만. 카메라 녹화(getUserMedia·MediaRecorder)는 2단계.
 *   ② ③ 껍데기. 트리밍·크롭은 3단계, 사운드·텍스트·볼륨 시트는 4단계.
 *   ④ 캡션·반려동물·주제 + 실제 업로드까지 동작한다 — 껍데기로 두면 플로우가 막다른 길이 되어
 *     1단계를 눈으로 확인할 수 없다. 썸네일 지정은 5단계.
 * 아직 채우지 않은 값(트림·볼륨·텍스트)은 서버로 보내지 않는다. 해당 칼럼이 DB에 없기 때문이고
 * (스키마는 Supabase에서 수동 관리), 3~5단계에서 DDL과 함께 붙인다.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_SEC } from '../videoFile'
import CameraPage from './CameraPage'
import EditPage from './EditPage'
import PublishPage from './PublishPage'
import TrimPage from './TrimPage'
import './createFlow.css'

export const STEP_CAMERA = 1
export const STEP_TRIM = 2
export const STEP_EDIT = 3
export const STEP_PUBLISH = 4

/*
 * 4페이지가 함께 쓰는 초안. 가이드 2절의 draft와 같은 역할이고, 이름만 이 저장소의 계약에 맞췄다.
 *
 *   musicId  → musicKey    곡은 DB가 아니라 정적 카탈로그(musicCatalog.js 66곡)로 관리하고
 *                          서버도 키로 검증한다(ShortsMusicKeys). 2026-08-14 결정.
 *   petId    → petIds      한 영상에 여러 마리가 나올 수 있어 목록이다(서버도 목록으로 받는다).
 *
 * musicVolume·videoVolume은 가이드 5-3절대로 0~100 독립 슬라이더로 간다(2026-08-14 결정).
 * 다만 DB 칼럼이 아직 없어 4단계에서 DDL과 함께 붙인다 — 그때까지 값은 기본값 그대로 남는다.
 */
const EMPTY_DRAFT = {
  // ① 카메라
  videoFile: null,   // File | Blob — 마지막까지 이것만 들고 있다가 ④에서 업로드
  videoUrl: '',      // URL.createObjectURL(videoFile) — 미리보기용. 반드시 해제해야 한다
  source: null,      // 'upload' | 'record'
  rawDuration: 0,    // 원본 길이(초)
  size: null,        // { width, height } — 9:16 대비 얼마나 잘리는지 계산에 쓴다

  // ② 길이/비율 — 3단계에서 채운다. 지금은 원본 전체를 그대로 쓴다
  trimStart: 0,
  trimEnd: 0,
  crop: { scale: 1, offsetX: 0, offsetY: 0 },

  // ③ 편집 — 4단계에서 채운다
  musicKey: '',
  musicStartSec: 0,
  textOverlays: [],  // [{ id, text, top, left }] — top/left는 0~100(%), 글자 블록 중심
  musicVolume: 100,
  videoVolume: 100,

  // ④ 발행
  caption: '',
  petIds: [],
  topics: [],

  /*
   * ④ 커버(썸네일). 기본은 재생 구간의 첫 프레임이라, 시트를 한 번도 열지 않아도 정상 동작한다.
   * 커버 글자는 영상 위 글자(textOverlays)와 **다른 배열**이다 — 사진에만 박히는 값이라
   * 목적도 표시 위치도 다르다(서버도 칼럼을 나눠 저장한다).
   */
  thumbnailTimeSec: 0,
  thumbnailTextOverlays: [],
}

export default function ShortsCreateFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState(STEP_CAMERA)
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  /*
   * 미리보기 blob URL 해제.
   *
   * draft.videoUrl을 의존성으로 둔 effect의 cleanup에 맡기지 않는다 — 그 방식은 "값이 바뀔 때
   * 이전 값을 해제"라서, 되돌아가 다른 파일을 고르는 경로에서 헷갈리기 쉽다. 여기서는 URL을
   * 만든 쪽(setVideo)이 이전 것을 즉시 해제하고, 화면을 떠날 때 마지막 하나만 정리한다.
   */
  const videoUrlRef = useRef('')
  useEffect(() => {
    const held = videoUrlRef
    return () => {
      if (held.current) URL.revokeObjectURL(held.current)
    }
  }, [])

  /**
   * draft 일부만 바꾼다. 객체를 주면 그대로 덮고, **함수를 주면 직전 draft를 받아** 바꿀 값을
   * 돌려준다 — 타이머·비동기 안에서 부를 때는 반드시 함수 쪽을 써야 한다.
   * (렌더 시점의 draft를 가둔 채 덮어쓰면 그 사이 사용자가 만진 값이 되돌아간다)
   */
  const patchDraft = (partial) =>
    setDraft((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }))

  /**
   * ①에서 영상이 정해지면 부른다. 녹화본이든 파일이든 같은 함수를 쓴다 —
   * 이후 페이지가 출처를 몰라도 되게 하려는 것이다(가이드 3절 goNextWithVideo).
   *
   * 트림 구간은 일단 원본 전체로 둔다. ②가 3단계에서 실제 손잡이를 붙이면 그때 좁혀진다.
   */
  const setVideo = ({ file, duration, width, height }, source) => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const url = URL.createObjectURL(file)
    videoUrlRef.current = url

    patchDraft({
      videoFile: file,
      videoUrl: url,
      source,
      rawDuration: duration,
      size: { width, height },
      trimStart: 0,
      /*
       * 기본 구간은 앞에서부터 최대 길이만큼. 원본이 이미 30초 이하면 통째로다.
       * 30초를 넘는 원본을 그대로 담으면 ②에 들어서자마자 "규격을 벗어난 구간" 상태가 되어,
       * 손잡이를 만지기 전에는 다음으로 갈 수 없는 화면이 된다
       */
      trimEnd: Math.min(duration, MAX_SEC),
      // 커버 기본값 = 구간 첫 프레임 (가이드 6절 "팝업을 안 열면 맨 앞 프레임")
      thumbnailTimeSec: 0,
    })
    setStep(STEP_TRIM)
  }

  /*
   * 뒤로가기. 1단계에서는 플로우 자체를 벗어난다.
   *
   * 브라우저 뒤로가기(history)를 쓰지 않고 화면 안 ← 버튼으로만 단계를 오간다.
   * 단계마다 history를 쌓으면 "뒤로가기 4번을 눌러야 피드로 나간다"가 되고, 반대로 안 쌓으면
   * 뒤로가기 한 번에 초안이 통째로 날아간다 — 둘 다 원하는 동작이 아니다.
   */
  const goBack = () => {
    if (step === STEP_CAMERA) {
      navigate('/shorts')
      return
    }
    setStep(step - 1)
  }

  // 새로고침 등으로 영상 없이 뒤 단계에 있게 되면 ①로 되돌린다 (draft는 메모리에만 있다)
  useEffect(() => {
    if (step !== STEP_CAMERA && !draft.videoFile) setStep(STEP_CAMERA)
  }, [step, draft.videoFile])

  const shared = { draft, patchDraft, goBack, goStep: setStep }

  return (
    <div className="sc-flow">
      {step === STEP_CAMERA && <CameraPage {...shared} onPicked={setVideo} />}
      {step === STEP_TRIM && <TrimPage {...shared} />}
      {step === STEP_EDIT && <EditPage {...shared} />}
      {step === STEP_PUBLISH && <PublishPage {...shared} />}
    </div>
  )
}
