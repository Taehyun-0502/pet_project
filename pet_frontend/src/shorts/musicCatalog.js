// ⚠️ 생성된 파일이다. 손으로 고치지 말고 스크립트를 다시 돌려라.
//    생성기: scratchpad/music_gen.py (음원 파일명 → 제목·아티스트 파싱)
//
// 숏츠 배경음악 카탈로그. Supabase Storage의 public `music` 버킷에 올라간 66곡이며,
// 전부 저작권 없는(로열티 프리) 음원이다. 업로드 화면의 곡 선택 목록과 피드 상단의
// 곡 정보 표시가 같은 이 목록을 쓴다.
//
// 서버는 같은 키 집합을 ShortsMusicKeys.java로 들고 있고 업로드 시 키를 검증한다.
// 곡을 추가/삭제하면 생성기를 돌려 양쪽을 함께 갱신해야 한다.

const MUSIC_BASE = 'https://itoujexkmfwffdmlupnw.supabase.co/storage/v1/object/public/music'

/**
 * key      Storage 객체 이름(확장자 포함). DB의 shorts.music_key에 저장되는 계약값
 * title    화면에 뜨는 곡 제목
 * artist   화면에 뜨는 아티스트
 */
const TRACKS = [
  { key: 'track-01.mp3', title: '당황, 엉뚱, 피곤, 짜증', artist: '213프리비지엠' },
  { key: 'about-that-oldie.mp3', title: 'About That Oldie', artist: 'Vibe Tracks' },
  { key: 'dog-and-pony-show.mp3', title: 'Dog and Pony Show', artist: 'Silent Partner' },
  { key: 'get-outside.mp3', title: 'Get Outside!', artist: 'Jason Farnham' },
  { key: 'happy-mistake.mp3', title: 'Happy Mistake', artist: 'RKVC' },
  { key: 'how-it-began.mp3', title: 'How it Began', artist: 'Silent Partner' },
  { key: 'if-i-had-a-chicken.mp3', title: 'If I Had a Chicken', artist: 'Kevin MacLeod' },
  { key: 'invisible.mp3', title: 'Invisible', artist: 'Vibe Tracks' },
  { key: 'jack-in-the-box.mp3', title: 'Jack in the Box', artist: 'Silent Partner' },
  { key: 'jigsaw-puzzle.mp3', title: 'Jigsaw Puzzle', artist: 'The Green Orbs' },
  { key: 'morning-stroll.mp3', title: 'Morning Stroll', artist: 'Josh Kirsch / Media Right Productions' },
  { key: 'mr-turtle.mp3', title: 'Mr. Turtle', artist: 'The Green Orbs' },
  { key: 'osaka-rain.mp3', title: 'Osaka Rain', artist: 'ALBIS' },
  { key: 'ponies-and-balloons.mp3', title: 'Ponies and Balloons', artist: 'The Green Orbs' },
  { key: 'rainy-day-games.mp3', title: 'Rainy Day Games', artist: 'The Green Orbs' },
  { key: 'sabana-havana.mp3', title: 'Sabana Havana', artist: 'Jimmy Fontanez / Media Right Productions' },
  { key: 'splashing-around.mp3', title: 'Splashing Around', artist: 'The Green Orbs' },
  { key: 'spring-in-my-step.mp3', title: 'Spring In My Step', artist: 'Silent Partner' },
  { key: 'springtime-family-band.mp3', title: 'Springtime Family Band', artist: 'The Green Orbs' },
  { key: 'beat-your-competition.mp3', title: 'Beat Your Competition', artist: 'Vibe Tracks' },
  { key: 'sugar-zone.mp3', title: 'Sugar Zone', artist: 'Silent Partner' },
  { key: 'whistling-down-the-road.mp3', title: 'Whistling Down the Road', artist: 'Silent Partner' },
  { key: 'bike-rides.mp3', title: 'Bike Rides', artist: 'The Green Orbs' },
  { key: 'track-24.mp3', title: '연인, 발랄, 행복 귀여움', artist: '213프리비지엠' },
  { key: 'bumper-tag.mp3', title: 'Bumper Tag', artist: 'John Deley' },
  { key: 'claudio-the-worm.mp3', title: 'Claudio The Worm', artist: 'The Green Orbs' },
  { key: 'messiah-by-handel.mp3', title: 'Messiah (by Handel)', artist: 'Handel' },
  { key: 'cuckoo-clock.mp3', title: 'Cuckoo Clock', artist: 'Quincas Moreira' },
  { key: 'midsummer-night-s-dream-by-mendelssohn.mp3', title: 'Midsummer Night\'s Dream (by Mendelssohn)', artist: 'Mendelssohn' },
  { key: 'cute-avalanche.mp3', title: 'Cute Avalanche', artist: 'RKVC' },
  { key: 'a-quiet-thought.mp3', title: 'A Quiet Thought', artist: 'Wayne Jones' },
  { key: 'e-minor-prelude.mp3', title: 'E Minor Prelude', artist: 'Chopin' },
  { key: 'ether.mp3', title: 'Ether', artist: 'Silent Partner' },
  { key: 'every-step.mp3', title: 'Every Step', artist: 'Silent Partner' },
  { key: 'first-love.mp3', title: 'First Love', artist: 'Wayne Jones' },
  { key: 'i-ll-remember-you.mp3', title: 'I\'ll Remember You', artist: 'Jeremy Blake' },
  { key: 'i-m-giving-up.mp3', title: 'I\'m Giving Up', artist: 'Everet Almond' },
  { key: 'no-6-in-my-dreams.mp3', title: 'No.6 In My Dreams', artist: 'Esther Abrami' },
  { key: 'pachabelly.mp3', title: 'Pachabelly', artist: 'Huma-Huma' },
  { key: 'touching-moment.mp3', title: 'Touching Moment', artist: 'Wayne Jones' },
  { key: 'animation-music-cartoon-fun.mp3', title: 'Animation Music Cartoon Fun', artist: 'Alex Morgan' },
  { key: 'ceremony-wedding-invitation-music.mp3', title: 'Ceremony Wedding Invitation Music', artist: 'Alex Morgan' },
  { key: 'comedy-bgm-funny-background-music.mp3', title: 'Comedy Bgm Funny Background Music', artist: 'Alex Morgan' },
  { key: 'elevator-music-on-hold.mp3', title: 'Elevator Music On Hold', artist: 'Alex Morgan' },
  { key: 'funny-sounds-blooper-comedy-music.mp3', title: 'Funny Sounds Blooper Comedy Music', artist: 'Alex Morgan' },
  { key: 'indian-flag-republic-day-music.mp3', title: 'Indian Flag Republic Day Music', artist: 'Alex Morgan' },
  { key: 'joyful-welcome-intro-music.mp3', title: 'Joyful Welcome Intro Music', artist: 'Alex Morgan' },
  { key: 'kitchen-cooking-show-music.mp3', title: 'Kitchen Cooking Show Music', artist: 'Alex Morgan' },
  { key: 'powerful-heroic-epic-music.mp3', title: 'Powerful Heroic Epic Music', artist: 'Alex Morgan' },
  { key: 'promo-teaser-trailer-music.mp3', title: 'Promo Teaser Trailer Music', artist: 'Alex Morgan' },
  { key: 'sentimental-poetry-background-music.mp3', title: 'Sentimental Poetry Background Music', artist: 'Alex Morgan' },
  { key: 'slow-motion-emotional-beat.mp3', title: 'Slow Motion Emotional Beat', artist: 'Alex Morgan' },
  { key: 'toddler-kids-background-music.mp3', title: 'Toddler Kids Background Music', artist: 'Alex Morgan' },
  { key: 'dark.mp3', title: 'Dark', artist: 'AudioCopper' },
  { key: 'wiggle-until-you-giggle.mp3', title: 'Wiggle Until You Giggle', artist: 'GoldenSoundLabs' },
  { key: 'cute-baby-animals-playful-cute-woodwinds.mp3', title: 'Cute Baby Animals Playful Cute Woodwinds', artist: 'HarumachiMusic' },
  { key: 'fluffy-cute-piano.mp3', title: 'Fluffy Cute Piano', artist: 'HarumachiMusic' },
  { key: 'quirky-sneaky-memes-background-music.mp3', title: 'Quirky Sneaky Memes Background Music', artist: 'HitsLab' },
  { key: 'blooming-spring-spring-upbeat.mp3', title: 'Blooming Spring Spring Upbeat', artist: 'LemonMusicStudio' },
  { key: 'funny-comedy-quirky-background-music.mp3', title: 'Funny Comedy Quirky Background Music', artist: 'LNPlusMusic' },
  { key: 'quirky-quirky-sneaky-music.mp3', title: 'Quirky Quirky Sneaky Music', artist: 'Maksym Malko' },
  { key: 'cartoon.mp3', title: 'Cartoon', artist: 'Nastelbom' },
  { key: 'football-football-music.mp3', title: 'Football Football Music', artist: 'SigmaMusicArt' },
  { key: 'comedy-quirky-sneaky-music.mp3', title: 'Comedy Quirky Sneaky Music', artist: 'Starostin' },
  { key: 'cute-cute-music.mp3', title: 'Cute Cute Music', artist: 'TataMusic' },
  { key: 'cute-pets-animals-music.mp3', title: 'Cute Pets Animals Music', artist: 'Viacheslav Starostin' },
]

// url은 key에서 기계적으로 나오므로 목록에 중복 저장하지 않고 여기서 붙인다
export const MUSIC_TRACKS = TRACKS.map((t) => ({ ...t, url: `${MUSIC_BASE}/${t.key}` }))

// key → 트랙. 피드가 shorts.musicKey로 제목·아티스트를 찾을 때 쓴다
const BY_KEY = new Map(MUSIC_TRACKS.map((t) => [t.key, t]))

/**
 * DB에 저장된 key로 트랙을 찾는다. 못 찾으면 null —
 * 카탈로그에서 곡을 빼도 그 곡을 쓰던 예전 영상의 재생이 깨지지 않게 하기 위함이다
 * (호출하는 쪽은 null이면 곡 표시와 BGM을 함께 건너뛴다).
 */
export function findTrack(key) {
  return key ? (BY_KEY.get(key) ?? null) : null
}
