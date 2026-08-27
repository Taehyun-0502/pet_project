/*
 * 🔊 볼륨 시트. (가이드 5-3절)
 *
 * 음악과 영상 소리를 각각 0~100으로 조절한다. 강제로 묶지 않는다 — "영상 소리 60 + 음악 40"
 * 같은 섞기가 실제로 쓰이고, 짖는 소리를 살리면서 음악을 얹고 싶은 경우가 있다.
 *
 * ⚠️ 이 자유도에는 대가가 있다. 예전 화면은 소리를 **세 모드**(원본 그대로/음소거/배경음악)로
 * 골랐고, 그 구조가 "곡을 안 골랐는데 원본만 꺼져서 무음 영상이 올라가는" 사고를 원천적으로
 * 막고 있었다(실제로 그렇게 올라간 영상이 있었다). 슬라이더 두 개는 그 상태를 다시 표현할 수
 * 있게 만든다 — 그래서 무음이 되는 조합을 여기서 눈에 띄게 알린다. 막지는 않는다:
 * 일부러 무음으로 올리는 것도 원래 있던 선택지였다.
 */

import { findTrack } from '../musicCatalog'

export default function VolumeSheet({ draft, patchDraft, onClose }) {
  const track = findTrack(draft.musicKey)
  const silent = draft.videoVolume === 0 && (!track || draft.musicVolume === 0)

  return (
    <div className="sc-sheet">
      <div className="sc-sheet-bar">
        <strong>볼륨</strong>
        <button type="button" className="sc-sheet-close" onClick={onClose}>
          완료
        </button>
      </div>

      <div className="sc-sheet-body">
        <label className="sc-vol">
          <span>
            🎵 음악
            <em>{track ? track.title : '곡을 고르지 않음'}</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draft.musicVolume}
            disabled={!track}
            onChange={(e) => patchDraft({ musicVolume: Number(e.target.value) })}
            aria-label="음악 볼륨"
          />
          <strong>{draft.musicVolume}</strong>
        </label>

        <label className="sc-vol">
          <span>
            🎬 영상 소리
            <em>영상에 녹음된 소리</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draft.videoVolume}
            onChange={(e) => patchDraft({ videoVolume: Number(e.target.value) })}
            aria-label="영상 소리 볼륨"
          />
          <strong>{draft.videoVolume}</strong>
        </label>

        {silent && (
          <p className="sc-warn">
            지금 설정으로는 <strong>아무 소리도 나지 않습니다.</strong>
            {!track && ' 곡을 고르거나 영상 소리를 올려주세요.'}
          </p>
        )}

        {/* 세 문장을 각각 한 줄로, **줄 사이를 더 띄우지 않고** 붙여 쓴다
            (2026-08-26 사용자 요청). 그래서 <p>를 둘로 나누지 않고 하나에 <br />로 담는다 —
            나누면 이 컬럼의 gap(.sc-sheet-body)만큼 줄 사이가 벌어진다.
            곡을 고르면 앞의 두 줄은 할 말이 없어져 빠지고 마지막 줄만 남는다 */}
        <p className="sc-note">
          {!track && (
            <>
              음악 볼륨은 곡을 고른 뒤에 조절할 수 있습니다.
              <br />위 <strong>♪ 사운드</strong>에서 고르세요.
              <br />
            </>
          )}
          미리보기에 바로 반영됩니다.
        </p>
      </div>
    </div>
  )
}
