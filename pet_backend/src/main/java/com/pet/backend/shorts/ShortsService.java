package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberErrorCode;
import com.pet.backend.member.MemberRepository;
import com.pet.backend.pet.Pet;
import com.pet.backend.pet.PetErrorCode;
import com.pet.backend.pet.PetRepository;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ShortsService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 30;

    /*
     * 회원별 목록(api-spec.md 8절)의 페이지 크기. 피드보다 큰 이유는 화면이 다르다 —
     * 피드는 한 번에 한 편을 세로로 넘기지만 목록은 썸네일 그리드라 한 화면에 여러 줄이 들어간다.
     */
    private static final int DEFAULT_LIST_SIZE = 20;
    private static final int MAX_LIST_SIZE = 50;

    // id는 bigserial이라 항상 양수 — 어떤 영상과도 겹치지 않는 자리표시 값
    private static final long NO_EXCLUSION = -1L;
    // 제외 목록이 무한정 자라지 않게 하는 상한 (MAX_LIMIT 기준 10페이지분)
    private static final int MAX_EXCLUDE_IDS = 300;

    /*
     * 영상 파일 규칙. 프론트에서도 검사하지만 그건 우회 가능하므로 최종 차단은 여기다.
     *
     * mp4 하나였다가 webm을 더했다 — 제작 플로우의 카메라 녹화(MediaRecorder) 때문이다.
     * 크롬 계열은 webm(VP8/VP9)만 뱉고 mp4를 지원하지 않는 버전이 많다. 사파리/iOS는 mp4를
     * 주므로, 둘 다 받지 않으면 어느 한쪽에서는 녹화 기능 자체가 성립하지 않는다.
     *
     * ⚠️ Supabase 버킷에 allowed_mime_types 제한이 걸려 있으면 여기서 통과해도 Storage가 거절한다.
     * 버킷 설정에 video/webm이 함께 있어야 한다.
     */
    private static final String MIME_MP4 = "video/mp4";
    private static final String MIME_WEBM = "video/webm";
    private static final long MAX_VIDEO_BYTES = 50L * 1024 * 1024;

    /*
     * 커버 이미지. 브라우저가 canvas로 구워 보내는 720x1280 jpeg라 형식을 하나로 고정한다 —
     * 사용자가 고른 파일이 아니라 우리가 만든 파일이므로 여러 형식을 받을 이유가 없다.
     * 2MB면 그 크기의 고화질 jpeg에 충분하고, 넘으면 뭔가 잘못 만든 것이다.
     */
    private static final String MIME_JPEG = "image/jpeg";
    private static final long MAX_THUMBNAIL_BYTES = 2L * 1024 * 1024;
    // jpeg는 파일 맨 앞이 SOI 마커 0xFFD8이고 그 뒤에 마커가 이어진다(0xFF)
    private static final byte[] JPEG_SOI = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    // mp4(ISO BMFF)는 파일 시작 부분 5~8번째 바이트가 'ftyp'이다
    private static final byte[] MP4_FTYP = {'f', 't', 'y', 'p'};
    // webm(Matroska)은 파일 맨 앞 4바이트가 EBML 헤더 0x1A45DFA3이다
    private static final byte[] WEBM_EBML = {(byte) 0x1A, 0x45, (byte) 0xDF, (byte) 0xA3};

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ShortsRepository shortsRepository;
    private final ShortsLikeRepository shortsLikeRepository;
    private final MemberRepository memberRepository;
    private final PetRepository petRepository; // 업로드할 때 고른 반려동물의 소유자 확인 + 품종 자동 태그
    private final ShortsStorageClient storageClient;
    private final ShortsEventService eventService;

    /**
     * 영상 한 건 조회. 공유 링크({@code /shorts?v=123})로 들어온 사람이 그 영상을 보게 하려고 있다.
     *
     * <p>피드와 같은 <b>공개 조회</b>다 — 링크를 받은 사람이 로그인해야 볼 수 있으면 공유가
     * 의미를 잃는다. 비로그인이면 viewerId가 null이고 likedByMe는 false가 된다.
     *
     * <p>랭킹·개인화를 거치지 않는다. "내가 올린 영상은 피드에서 제외"라는 규칙도 여기서는
     * 적용하지 않는다 — 자기 영상 링크를 열었을 때 못 보는 것이 오히려 이상하다.
     *
     * @param shortId 없거나 삭제된 영상이면 404
     */
    public ShortsResponse getOne(Long viewerId, Long shortId) {
        // findAllByIds를 재사용한다 — 회원 이름 조인과 필드 구성이 피드와 완전히 같아야 하고,
        // 같은 응답을 만드는 쿼리를 두 벌 두면 한쪽만 고치는 사고가 난다.
        // 탈퇴 회원의 영상은 이 쿼리가 걸러내므로 빈 목록이 되어 404가 된다
        List<ShortsResponse> found = shortsRepository.findAllByIds(List.of(shortId));
        if (found.isEmpty()) {
            throw new BusinessException(ShortsErrorCode.NOT_FOUND);
        }
        return fillLikedByMe(found, viewerId).get(0);
    }

    /**
     * 회원별 릴스 목록 (docs/api-spec.md 8절 — 마이페이지 "내 게시물" F8, 유저 페이지 F9).
     *
     * <p><b>내 목록과 남의 목록이 같은 조회다.</b> 보는 사람이 누구인지 따지지 않는다 —
     * 삭제 버튼을 띄울지는 화면이 응답의 {@code memberId}와 자기 id를 비교해 판단하고,
     * 실제 삭제는 {@link #delete}가 소유자를 다시 확인한다. 분기를 서버에 두면 같은 목록을
     * 만드는 경로가 두 벌이 된다.
     *
     * <p>피드({@link #getFeed})와 <b>페이지네이션 방식이 다르다.</b> 저쪽은 점수 순서가 id 순서와
     * 무관해 {@code excludeIds}를 쓰지만, 이 목록의 두 정렬은 순서가 안정적이라 커서가 성립한다.
     *
     * @param rawMemberId 경로에서 온 값. 숫자가 아니면 404로 흡수한다({@link #toMemberId})
     * @param rawSort     {@code latest}(기본) 또는 {@code popular}. 그 밖의 값은 400
     * @param rawCursor   직전 응답의 {@code nextCursor}. 없으면 첫 페이지
     * @param size        1~50, 기본 20. 범위를 벗어나면 잘라서 처리한다(피드의 limit과 같은 규칙)
     * @throws BusinessException 없는 회원·탈퇴 회원이면 404. <b>빈 목록 200이 아니다</b> —
     *                           유저 페이지가 "영상이 없는 사람"과 "없는 사람"을 구분해야 한다
     */
    @Transactional(readOnly = true)
    public ShortsListResponse getMemberShorts(String rawMemberId, String rawSort,
                                              String rawCursor, Integer size) {
        Long memberId = toMemberId(rawMemberId);
        if (memberRepository.findByIdAndDeletedAtIsNull(memberId).isEmpty()) {
            throw new BusinessException(MemberErrorCode.NOT_FOUND);
        }

        ShortsListSort sort = ShortsListSort.from(rawSort);
        ShortsListCursor cursor = ShortsListCursor.parse(sort, rawCursor);
        int pageSize = normalizeListSize(size);
        // size + 1건을 읽어 다음 페이지 유무를 판단한다 (getFeed와 같은 방식 — 딱 size개만
        // 가져오면 마지막 페이지인지 알 수 없어 빈 페이지를 한 번 더 요청하게 된다)
        Pageable page = PageRequest.of(0, pageSize + 1);

        List<ShortsSummaryResponse> found = (sort == ShortsListSort.LATEST)
                ? shortsRepository.findMemberShortsLatest(memberId, cursorId(cursor), page)
                : shortsRepository.findMemberShortsPopular(memberId,
                        (cursor == null) ? null : cursor.likeCount(), cursorId(cursor), page);

        boolean hasNext = found.size() > pageSize;
        List<ShortsSummaryResponse> items = hasNext ? found.subList(0, pageSize) : found;
        String nextCursor = hasNext
                ? ShortsListCursor.format(sort, items.get(items.size() - 1))
                : null;
        return new ShortsListResponse(items, hasNext, nextCursor);
    }

    private Long cursorId(ShortsListCursor cursor) {
        return (cursor == null) ? null : cursor.id();
    }

    /**
     * 경로의 회원 id를 숫자로 바꾼다. 숫자가 아니면 500이 아니라 <b>404</b>로 흡수한다 —
     * 없는 id·탈퇴 회원과 응답을 통일해 존재 여부가 새어나가지 않게 한다
     * (MemberService.getPublicProfile 선례, docs/conventions.md 5절).
     */
    private Long toMemberId(String rawMemberId) {
        try {
            return Long.valueOf(rawMemberId);
        } catch (NumberFormatException e) {
            throw new BusinessException(MemberErrorCode.NOT_FOUND);
        }
    }

    // 잘못된 size(0, 음수, 과도한 값)로 DB를 긁는 것을 막는다 (normalizeLimit과 같은 규칙)
    private int normalizeListSize(Integer size) {
        if (size == null || size < 1) {
            return DEFAULT_LIST_SIZE;
        }
        return Math.min(size, MAX_LIST_SIZE);
    }

    /**
     * 영상 삭제. 올린 사람만 지울 수 있다.
     *
     * <p>물리 삭제가 아니라 {@code deleted_at}을 채운다 — 좋아요·댓글·이력이 이 행을 참조하므로
     * 지우면 FK 위반이 난다 (Shorts.softDelete 주석 참고).
     *
     * <p>남의 영상이면 <b>404를 준다</b>(403이 아니다). 403은 "그 영상은 있는데 네 것이 아니다"를
     * 알려주는 셈이라, id를 훑어 남의 영상 존재 여부를 알아낼 수 있다. 반려동물 조회에서
     * 존재 여부를 숨기는 것과 같은 규칙이다.
     */
    @Transactional
    public void delete(Long memberId, Long shortId) {
        Shorts shorts = shortsRepository.findByIdAndDeletedAtIsNull(shortId)
                .filter(found -> found.getMemberId().equals(memberId))
                .orElseThrow(() -> new BusinessException(ShortsErrorCode.NOT_FOUND));

        shorts.softDelete(Instant.now());
        // 더티 체킹으로 UPDATE가 나가므로 save 호출이 필요 없다 (트랜잭션 커밋 시 flush)
    }

    /**
     * 영상 좋아요 토글. 이미 눌렀으면 취소한다 (shorts_guide_1.md 4절).
     *
     * <p>좋아요 수는 엔티티를 읽어 +1 하지 않고 DB에서 직접 더한다 — 두 사람이 동시에 누를 때
     * 하나가 사라지는 경합을 피하기 위함이다(ShortsRepository.increaseLikeCount 참고).
     */
    @Transactional
    public LikeToggleResponse toggleLike(Long memberId, Long shortId) {
        if (!shortsRepository.existsByIdAndDeletedAtIsNull(shortId)) {
            throw new BusinessException(ShortsErrorCode.NOT_FOUND);
        }

        boolean liked;
        // 지운 행이 있으면 "눌러져 있었다" → 취소. 없으면 새로 누른다
        if (shortsLikeRepository.deleteByShortIdAndMemberId(shortId, memberId) > 0) {
            shortsRepository.decreaseLikeCount(shortId);
            liked = false;
        } else {
            shortsLikeRepository.save(ShortsLike.of(shortId, memberId));
            shortsRepository.increaseLikeCount(shortId);
            liked = true;
            // 추천 알고리즘용 행동 이력 (가이드 2절 ③). 누른 순간에만 남기고 취소는 기록하지 않는다 —
            // shorts_like 행은 사라지지만 "그때 좋아했다"는 사실은 유효한 취향 신호다.
            // 취소까지 음의 신호로 처리하는 것은 D단계 튜닝 몫
            eventService.recordInteraction(memberId, shortId, ShortsEventType.LIKE);
        }

        // 갱신된 수를 서버가 알려준다 — 화면이 직접 계산하면 다른 사람의 좋아요와 어긋난다
        return new LikeToggleResponse(liked, shortsRepository.findLikeCount(shortId));
    }

    /**
     * 영상 파일을 Storage에 올리고 공개 URL을 돌려준다. 파일이 이 서버를 거치므로
     * Content-Type을 믿지 않고 내용까지 확인할 수 있다.
     *
     * <p>트랜잭션을 걸지 않는다 — DB를 건드리지 않고, 외부 네트워크 호출 동안
     * 커넥션을 붙잡고 있으면 풀(5개)이 금방 마른다.
     *
     * @param memberId 올린 사람. 파일 경로에 넣어 나중에 추적할 수 있게 한다
     */
    public ShortsVideoResponse uploadVideo(Long memberId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "올릴 영상 파일이 없습니다.");
        }
        if (file.getSize() > MAX_VIDEO_BYTES) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "영상은 %dMB 이하만 올릴 수 있습니다.".formatted(MAX_VIDEO_BYTES / 1024 / 1024));
        }
        /*
         * 녹화본의 Content-Type에는 코덱 파라미터가 붙어 온다(video/webm;codecs=vp9,opus).
         * 정확히 일치시키면 브라우저·버전마다 다른 그 꼬리표 때문에 멀쩡한 녹화가 튕긴다.
         */
        String declared = baseMime(file.getContentType());
        if (!MIME_MP4.equals(declared) && !MIME_WEBM.equals(declared)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "mp4 또는 webm 영상만 올릴 수 있습니다.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(ShortsErrorCode.UPLOAD_FAILED, "영상 파일을 읽을 수 없습니다.");
        }

        /*
         * Content-Type은 클라이언트가 보낸 값이라 위조할 수 있다. 내용으로 한 번 더 확인하고,
         * **선언한 형식과 같은지까지** 본다. 내용만 보면 mp4를 webm이라 우겨 올릴 수 있고,
         * 그러면 .webm 확장자에 mp4 내용인 파일이 Storage에 남아 재생이 깨진다.
         */
        String actual = sniffVideoMime(bytes);
        if (actual == null || !actual.equals(declared)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "mp4 또는 webm 영상이 아닙니다. 확장자만 바꾼 파일은 올릴 수 없습니다.");
        }

        String extension = MIME_MP4.equals(actual) ? "mp4" : "webm";
        String path = "%d/%d-%s.%s"
                .formatted(memberId, System.currentTimeMillis(), randomSuffix(), extension);
        return new ShortsVideoResponse(storageClient.upload(path, bytes, actual));
    }

    /**
     * 커버(썸네일) 이미지를 Storage에 올리고 공개 URL을 돌려준다.
     *
     * <p>영상과 나눈 이유는 컨트롤러 주석 참고 — 허용 형식과 크기 상한이 전혀 다르다.
     * 트랜잭션을 걸지 않는 것도 {@link #uploadVideo}와 같다(DB를 건드리지 않는다).
     */
    public ShortsThumbnailResponse uploadThumbnail(Long memberId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "올릴 커버 이미지가 없습니다.");
        }
        if (file.getSize() > MAX_THUMBNAIL_BYTES) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "커버 이미지는 %dMB 이하만 올릴 수 있습니다.".formatted(MAX_THUMBNAIL_BYTES / 1024 / 1024));
        }
        if (!MIME_JPEG.equals(baseMime(file.getContentType()))) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "커버 이미지는 jpeg만 올릴 수 있습니다.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(ShortsErrorCode.UPLOAD_FAILED, "커버 이미지를 읽을 수 없습니다.");
        }
        // Content-Type은 클라이언트가 보낸 값이라 위조할 수 있다 — 내용으로 한 번 더 확인한다
        if (!startsWith(bytes, JPEG_SOI, 0)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "jpeg 이미지가 아닙니다.");
        }

        // 영상과 **버킷이 다르다**(shorts-thumbnails) — 이유는 ShortsStorageClient 주석 참고.
        // 버킷이 나뉘어 있으므로 thumb- 접두어는 사람이 로그에서 알아보기 위한 것뿐이다
        String path = "%d/thumb-%d-%s.jpg"
                .formatted(memberId, System.currentTimeMillis(), randomSuffix());
        return new ShortsThumbnailResponse(storageClient.uploadThumbnail(path, bytes, MIME_JPEG));
    }

    /**
     * 업로드 등록. 영상 파일은 이미 Storage에 올라가 있고 여기서는 그 위치와 정보만 DB에 남긴다.
     *
     * @param memberId 컨트롤러가 토큰에서 꺼내 넘긴 값 — 요청 바디의 값을 쓰면 남의 이름으로 올릴 수 있다
     */
    @Transactional
    public ShortsResponse upload(Long memberId, ShortsCreateRequest request) {
        // 응답에 올린 사람 이름이 필요하고, 탈퇴 회원의 업로드를 막는 검사도 겸한다
        Member member = memberRepository.findById(memberId)
                .filter(found -> !found.isDeleted())
                .orElseThrow(() -> new BusinessException(MemberErrorCode.NOT_FOUND));

        // 고르지 않았으면 빈 목록. 골랐다면 전부 "내 것, 활성"이어야 한다
        List<Pet> pets = findMyPets(memberId, request.petIds());

        Shorts shorts = Shorts.upload(memberId, request.videoUrl().trim(),
                blankToNull(request.thumbnailUrl()), blankToNull(request.caption()),
                toTags(request.topics(), pets), request.durationSec(),
                validMusicKey(request.musicKey()), request.muteOriginalOrDefault(),
                request.musicStartSecOrDefault(),
                request.overlayTextsOrEmpty(),
                request.trimStartSecOrDefault(), request.trimEndSec(), request.crop(),
                request.musicVolumeOrDefault(), request.videoVolumeOrDefault(),
                request.thumbnailTimeSecOrDefault(), request.thumbnailTextOverlaysOrEmpty());
        shortsRepository.save(shorts);

        return ShortsResponse.of(shorts, member.getName());
    }

    /**
     * 고른 반려동물들을 확인해 가져온다 — <b>품종을 자동 태그로 붙이기 위한 조회다.</b>
     * "어느 반려동물이 나왔는지"를 따로 저장하지는 않는다(스키마를 늘리지 않기로 했다).
     * 그래도 검증을 하는 이유는 남의 반려동물 품종을 사칭해 태그로 넣을 수 있기 때문이다.
     *
     * <p><b>하나라도 내 것이 아니면 전체를 거절한다</b> — 남의 것만 조용히 빼고 저장하면
     * 사용자는 고른 대로 태그가 붙은 줄 알게 된다.
     *
     * <p>조회 조건에 소유자를 넣어 없음/남의 것/삭제됨을 모두 404로 합친다
     * (PetService와 같은 원칙, docs/conventions.md 5절 — id 존재 여부가 새어나가지 않게).
     */
    private List<Pet> findMyPets(Long memberId, List<Long> petIds) {
        if (petIds == null || petIds.isEmpty()) {
            return List.of();
        }
        return petIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .map(petId -> petRepository.findByIdAndMemberIdAndDeletedAtIsNull(petId, memberId)
                        .orElseThrow(() -> new BusinessException(PetErrorCode.NOT_FOUND)))
                .toList();
    }

    /**
     * 피드 조회. 로그인 없이도 볼 수 있는 공개 조회다 (shorts_guide_1.md 7절 — 업로드·좋아요만 인증 필요).
     *
     * <p><b>정렬은 로그인 여부로 갈린다</b> (C단계, 가이드 5절).
     * <ul>
     *   <li>비로그인 → 품질점수순. 참여도 높고 최근인 영상이 위로 (B단계, 가이드 4-a절)</li>
     *   <li>로그인 → 품질점수 × 태그 선호 부스트, 그리고 <b>이미 본 영상은 뒤로</b></li>
     * </ul>
     * 커서 페이지네이션은 B단계에서 버렸다(가이드 9절): 점수 순서는 id 순서와 무관하므로
     * "이 id보다 작은 것"이라는 커서로는 2페이지가 1페이지에 없던 고득점 항목을 통째로 건너뛴다.
     *
     * @param viewerId   보는 사람. 비로그인이면 null이고, 이때 likedByMe는 모두 false다
     * @param excludeIds 이미 받은 id들. 다음 페이지는 "이것들을 빼고 다시 상위 N개"다
     * @param limit      가져올 개수. null이면 10개, 상한 30개
     */
    @Transactional(readOnly = true)
    public ShortsFeedResponse getFeed(Long viewerId, List<Long> excludeIds, Integer limit) {
        int size = normalizeLimit(limit);

        // size + 1개를 조회해 "다음 페이지가 있는지"를 판단한다.
        // 딱 size개만 가져오면 마지막 페이지인지 알 수 없어 빈 페이지를 한 번 더 요청하게 된다
        List<Long> rankedIds = rankIds(viewerId, toExclusionList(excludeIds), size + 1);
        boolean hasNext = rankedIds.size() > size;
        List<Long> pageIds = hasNext ? rankedIds.subList(0, size) : rankedIds;
        if (pageIds.isEmpty()) {
            return new ShortsFeedResponse(List.of(), false);
        }

        // 점수 순서는 랭킹 쿼리만 알고 있다. in 절 조회는 정렬과 무관하므로 여기서 다시 맞춘다 —
        // 이 재정렬을 빼면 애써 계산한 순위가 버려지고 DB가 돌려주는 임의 순서로 화면에 나간다
        Map<Long, ShortsResponse> byId = shortsRepository.findAllByIds(pageIds).stream()
                .collect(Collectors.toMap(ShortsResponse::id, Function.identity()));
        List<ShortsResponse> items = pageIds.stream()
                .map(byId::get)
                // 두 쿼리 사이에 삭제된 영상. 순위에는 있었지만 데이터가 없으므로 조용히 뺀다
                .filter(Objects::nonNull)
                .toList();

        return new ShortsFeedResponse(fillLikedByMe(items, viewerId), hasNext);
    }

    /**
     * 순위를 정한다 — <b>로그인 여부로 갈린다</b> (C단계, 가이드 5절).
     *
     * <p>비로그인에게 개인화 쿼리를 태우지 않는 이유가 성능 때문만은 아니다.
     * {@code memberId}가 null이면 tag_affinity가 비고 exists도 거짓이라 결과는 같겠지만,
     * <b>네이티브 쿼리에 NULL 파라미터를 넘기면 PostgreSQL이 타입을 추론하지 못해 실패한다</b>
     * (B단계 이전 커서를 primitive long으로 둔 것과 같은 이유). 즉 분기는 선택이 아니다.
     */
    private List<Long> rankIds(Long viewerId, Collection<Long> excludeIds, int limit) {
        if (viewerId == null) {
            return shortsRepository.findRankedIds(excludeIds, limit);
        }
        return shortsRepository.findPersonalizedRankedIds(viewerId, excludeIds, limit);
    }

    /**
     * {@code not in (:excludeIds)}에 넘길 목록. <b>절대 비어 있으면 안 된다.</b>
     *
     * <p>빈 목록을 넘기면 JPA가 {@code not in (null)}로 펼치는데, SQL에서 NULL 비교는 참이 되지 않으므로
     * <b>조건에 걸리는 행이 하나도 없다</b> — 첫 페이지가 통째로 빈 화면이 된다. 에러도 나지 않아서
     * "영상이 없습니다"로 보이는 종류의 사고다. 그래서 자리표시 값을 항상 하나 넣는다.
     *
     * <p>개수 상한도 함께 둔다. 스크롤이 길어지면 목록이 계속 자라 IN 절이 비대해지고, 요청을 직접
     * 만들면 수만 개를 보낼 수도 있다. 상한을 넘으면 <b>최근 것부터</b> 남긴다 — 방금 본 영상이 다시
     * 뜨는 것이 오래전에 본 영상이 다시 뜨는 것보다 눈에 거슬리기 때문이다.
     */
    private Collection<Long> toExclusionList(List<Long> excludeIds) {
        if (excludeIds == null || excludeIds.isEmpty()) {
            return List.of(NO_EXCLUSION);
        }
        List<Long> cleaned = excludeIds.stream().filter(Objects::nonNull).distinct().toList();
        if (cleaned.size() > MAX_EXCLUDE_IDS) {
            cleaned = cleaned.subList(cleaned.size() - MAX_EXCLUDE_IDS, cleaned.size());
        }
        return Stream.concat(cleaned.stream(), Stream.of(NO_EXCLUSION)).toList();
    }

    /**
     * "내가 좋아요한 영상"을 한 번의 추가 쿼리로 표시한다.
     * 피드 쿼리에 조건부 조인을 섞으면 비로그인 경우의 파라미터 타입 문제와 쿼리 복잡도가 커져,
     * 목록을 받은 뒤 id들로 한 번만 더 물어보는 쪽을 택했다.
     */
    private List<ShortsResponse> fillLikedByMe(List<ShortsResponse> items, Long viewerId) {
        if (viewerId == null || items.isEmpty()) {
            return items;
        }
        Set<Long> likedIds = Set.copyOf(shortsLikeRepository.findLikedShortIds(
                viewerId, items.stream().map(ShortsResponse::id).toList()));
        return items.stream()
                .map(item -> item.withLikedByMe(likedIds.contains(item.id())))
                .toList();
    }

    // 잘못된 limit(0, 음수, 과도한 값)으로 DB를 긁는 것을 막는다
    private int normalizeLimit(Integer limit) {
        if (limit == null || limit < 1) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    // 빈 문자열("")로 온 선택 입력은 NULL로 통일 — PetService.normalizeBreed와 같은 이유
    private String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim();
    }

    /**
     * 클라이언트가 고른 주제를 {@code shorts.tags}에 넣을 문자열 배열로 바꾼다.
     *
     * <p><b>고정 목록 검증이 핵심이다.</b> 목록 밖 값을 허용하면 개인화가 조용히 무력해진다 —
     * 선호도는 태그 문자열이 정확히 같을 때만 합산되므로(가이드 5절 {@code tag = any(s.tags)}),
     * '귀여움'과 '귀여워'가 섞이면 같은 취향이 두 태그로 흩어진다. 프론트가 칩으로만 고르게
     * 막지만 API를 직접 호출하면 뚫리므로 최종 차단은 여기다.
     *
     * <p><b>중복 제거</b>도 중요하다. 선호도 집계가 {@code unnest(s.tags)}로 태그를 한 줄씩
     * 펼쳐 <b>합산</b>하므로, 같은 주제가 배열에 두 번 들어 있으면 그 영상을 본 것만으로
     * 해당 주제 점수가 두 배가 된다.
     *
     * <p><b>자동 태그(설계 5절)</b>는 업로드할 때 고른 반려동물의 <b>품종만</b> 붙인다.
     * 개수 상한({@code @Size(max = 5)})은 사용자가 고르는 주제에만 걸리는 값이라 자동 태그는
     * 그 밖이다 — 최종 {@code shorts.tags}는 "주제 + 자동 태그"의 합집합이다.
     *
     * <p>나머지 자동 태그는 여전히 스키마가 없어 붙이지 못한다 — {@code pet}에 종(species)
     * 컬럼이 없고(강아지 전용 서비스), {@code pet_member}에 지역 컬럼이 없다. 생기면 여기에
     * 같은 방식으로 합치면 된다.
     *
     * <p><b>주의</b> — {@code pet.breed}는 자유 입력이라 '골든리트리버'/'골든'/'골리'가 서로 다른
     * 태그가 된다(설계 1절 ⚠). 선호도는 문자열이 정확히 같을 때만 합산되므로(가이드 5절
     * {@code tag = any(s.tags)}) 표기가 갈린 만큼 부스트도 갈린다. 품종을 고정 목록으로 바꾸기
     * 전까지는 이 한계를 안고 간다.
     *
     * @param pets 업로드할 때 고른 반려동물들. 고르지 않았으면 빈 목록
     * @return 남은 태그가 없으면 null — 엔티티에서 빈 배열을 NULL로 통일하는 것과 같은 이유
     */
    private List<String> toTags(List<String> topics, List<Pet> pets) {
        // 주제를 하나도 고르지 않아도(topics == null) 품종 자동 태그는 붙어야 하므로 여기서 끝내지 않는다
        List<String> labels = toTopicLabels(topics);

        // 같은 품종의 반려동물을 여러 마리 골랐으면 태그는 하나다. 배열에 두 번 들어가면
        // unnest 합산에서 그 태그 점수가 두 배가 된다 (고른 주제와 겹치는 경우도 마찬가지)
        List<String> breeds = pets.stream()
                .map(pet -> blankToNull(pet.getBreed()))
                .filter(Objects::nonNull)
                .toList();

        List<String> merged = Stream.concat(labels.stream(), breeds.stream()).distinct().toList();
        return merged.isEmpty() ? null : merged;
    }

    /**
     * 배경음악 키를 검증한다. 고르지 않았으면(null·빈 문자열) null을 돌려준다.
     *
     * <p>목록을 닫아두는 이유는 {@code topics}와 같지만 이유가 하나 더 있다 — 이 기능의 목적이
     * <b>저작권 없는 음원만 쓰게 하는 것</b>이라서다. 임의 키(나아가 URL)를 허용하면
     * 통제가 무너지고, 업로드 화면의 저작권 고지도 의미가 없어진다.
     *
     * <p>허용 목록을 메시지에 담지 않는다 — 66개를 늘어놓으면 오히려 읽히지 않는다.
     * 애초에 사용자가 손으로 넣는 값이 아니라 화면이 카탈로그에서 골라 보내는 값이라,
     * 여기에 걸리는 것은 카탈로그와 서버 목록이 어긋난 <b>개발 실수</b>다.
     */
    private String validMusicKey(String musicKey) {
        String key = blankToNull(musicKey);
        if (key == null) {
            return null;
        }
        if (!ShortsMusicKeys.ALL.contains(key)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "알 수 없는 음원입니다. 목록에서 다시 골라주세요.");
        }
        return key;
    }

    private List<String> toTopicLabels(List<String> topics) {
        if (topics == null) {
            return List.of();
        }
        List<String> labels = topics.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(topic -> !topic.isEmpty())
                .map(topic -> ShortsTopic.from(topic)
                        .orElseThrow(() -> new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                                "'%s'는 선택할 수 없는 주제입니다. 다음 중에서 골라주세요: %s"
                                        .formatted(topic, String.join(", ", ShortsTopic.labels())))))
                .map(ShortsTopic::label)
                .distinct()
                .toList();
        // 빈 목록을 그대로 돌려준다 — NULL 통일은 자동 태그까지 합친 뒤 toTags가 한 번에 판단한다
        return labels;
    }

    /**
     * 파라미터를 떼어낸 기본 MIME 타입. {@code video/webm;codecs=vp9,opus} → {@code video/webm}.
     * 값이 없으면 null을 돌려주고, 호출부가 허용 목록에 없는 것으로 처리한다.
     */
    private String baseMime(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return null;
        }
        int semicolon = contentType.indexOf(';');
        String base = (semicolon < 0) ? contentType : contentType.substring(0, semicolon);
        return base.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * 파일 내용으로 형식을 판별한다. 허용 목록 밖이면 null.
     *
     * <p>mp4(ISO BMFF)는 [0..3]이 박스 크기이고 [4..7]이 {@code 'ftyp'},
     * webm(Matroska)은 [0..3]이 EBML 헤더 {@code 0x1A45DFA3}이다.
     */
    private String sniffVideoMime(byte[] bytes) {
        if (bytes.length < 12) {
            return null;
        }
        if (startsWith(bytes, WEBM_EBML, 0)) {
            return MIME_WEBM;
        }
        if (startsWith(bytes, MP4_FTYP, 4)) {
            return MIME_MP4;
        }
        return null;
    }

    private boolean startsWith(byte[] bytes, byte[] signature, int offset) {
        if (bytes.length < offset + signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (bytes[offset + i] != signature[i]) {
                return false;
            }
        }
        return true;
    }

    // 같은 밀리초에 두 명이 올려도 경로가 겹치지 않게 하는 꼬리표
    private String randomSuffix() {
        byte[] buffer = new byte[4];
        RANDOM.nextBytes(buffer);
        return HexFormat.of().formatHex(buffer);
    }
}
