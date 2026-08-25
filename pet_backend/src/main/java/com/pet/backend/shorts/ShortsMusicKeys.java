package com.pet.backend.shorts;

import java.util.Set;

/**
 * ⚠️ 생성된 파일이다. 손으로 고치지 말고 생성기(scratchpad/music_gen.py)를 다시 돌려라.
 *
 * <p>숏츠 배경음악으로 고를 수 있는 키 목록. Supabase Storage의 public {@code music}
 * 버킷에 실제로 올라간 객체 이름과 1:1이다.
 *
 * <p><b>제목·아티스트를 여기 두지 않는 이유</b>: 서버는 그 값을 쓰지 않는다. 화면에 뿌리는
 * 것은 프론트의 {@code musicCatalog.js}이고, 서버가 할 일은 <b>업로드 요청의 키가
 * 실제 음원인지 확인</b>하는 것뿐이다. 쓰지 않는 문자열을 양쪽에 두면 한쪽만 고치는 사고가 난다.
 *
 * <p>목록을 닫아두는 이유는 {@code ShortsTopic}과 같다 — 열어두면 클라이언트가 임의
 * 문자열을 넣어 존재하지 않는 음원을 가리키는 영상이 생기고, 피드에서 조용히 무음이 된다.
 */
final class ShortsMusicKeys {

    static final Set<String> ALL = Set.of(
            "track-01.mp3",
            "about-that-oldie.mp3",
            "dog-and-pony-show.mp3",
            "get-outside.mp3",
            "happy-mistake.mp3",
            "how-it-began.mp3",
            "if-i-had-a-chicken.mp3",
            "invisible.mp3",
            "jack-in-the-box.mp3",
            "jigsaw-puzzle.mp3",
            "morning-stroll.mp3",
            "mr-turtle.mp3",
            "osaka-rain.mp3",
            "ponies-and-balloons.mp3",
            "rainy-day-games.mp3",
            "sabana-havana.mp3",
            "splashing-around.mp3",
            "spring-in-my-step.mp3",
            "springtime-family-band.mp3",
            "beat-your-competition.mp3",
            "sugar-zone.mp3",
            "whistling-down-the-road.mp3",
            "bike-rides.mp3",
            "track-24.mp3",
            "bumper-tag.mp3",
            "claudio-the-worm.mp3",
            "messiah-by-handel.mp3",
            "cuckoo-clock.mp3",
            "midsummer-night-s-dream-by-mendelssohn.mp3",
            "cute-avalanche.mp3",
            "a-quiet-thought.mp3",
            "e-minor-prelude.mp3",
            "ether.mp3",
            "every-step.mp3",
            "first-love.mp3",
            "i-ll-remember-you.mp3",
            "i-m-giving-up.mp3",
            "no-6-in-my-dreams.mp3",
            "pachabelly.mp3",
            "touching-moment.mp3",
            "animation-music-cartoon-fun.mp3",
            "ceremony-wedding-invitation-music.mp3",
            "comedy-bgm-funny-background-music.mp3",
            "elevator-music-on-hold.mp3",
            "funny-sounds-blooper-comedy-music.mp3",
            "indian-flag-republic-day-music.mp3",
            "joyful-welcome-intro-music.mp3",
            "kitchen-cooking-show-music.mp3",
            "powerful-heroic-epic-music.mp3",
            "promo-teaser-trailer-music.mp3",
            "sentimental-poetry-background-music.mp3",
            "slow-motion-emotional-beat.mp3",
            "toddler-kids-background-music.mp3",
            "dark.mp3",
            "wiggle-until-you-giggle.mp3",
            "cute-baby-animals-playful-cute-woodwinds.mp3",
            "fluffy-cute-piano.mp3",
            "quirky-sneaky-memes-background-music.mp3",
            "blooming-spring-spring-upbeat.mp3",
            "funny-comedy-quirky-background-music.mp3",
            "quirky-quirky-sneaky-music.mp3",
            "cartoon.mp3",
            "football-football-music.mp3",
            "comedy-quirky-sneaky-music.mp3",
            "cute-cute-music.mp3",
            "cute-pets-animals-music.mp3"
    );

    private ShortsMusicKeys() {
    }
}
