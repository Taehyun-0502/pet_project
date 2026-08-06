package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberRepository;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ShortsService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 30;

    // 영상 파일 규칙. 프론트에서도 검사하지만 그건 우회 가능하므로 최종 차단은 여기다
    private static final String VIDEO_MIME = "video/mp4";
    private static final long MAX_VIDEO_BYTES = 50L * 1024 * 1024;
    // mp4(ISO BMFF)는 파일 시작 부분 5~8번째 바이트가 'ftyp'이다
    private static final byte[] MP4_FTYP = {'f', 't', 'y', 'p'};

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ShortsRepository shortsRepository;
    private final ShortsLikeRepository shortsLikeRepository;
    private final MemberRepository memberRepository;
    private final ShortsStorageClient storageClient;

    /**
     * 영상 좋아요 토글. 이미 눌렀으면 취소한다 (shorts_guide_1.md 4절).
     *
     * <p>좋아요 수는 엔티티를 읽어 +1 하지 않고 DB에서 직접 더한다 — 두 사람이 동시에 누를 때
     * 하나가 사라지는 경합을 피하기 위함이다(ShortsRepository.increaseLikeCount 참고).
     */
    @Transactional
    public LikeToggleResponse toggleLike(Long memberId, Long shortId) {
        if (!shortsRepository.existsByIdAndDeletedAtIsNull(shortId)) {
            throw new BusinessException(ErrorCode.SHORTS_NOT_FOUND);
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
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "올릴 영상 파일이 없습니다.");
        }
        if (file.getSize() > MAX_VIDEO_BYTES) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "영상은 %dMB 이하만 올릴 수 있습니다.".formatted(MAX_VIDEO_BYTES / 1024 / 1024));
        }
        if (!VIDEO_MIME.equals(file.getContentType())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "mp4 영상만 올릴 수 있습니다.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.SHORTS_UPLOAD_FAILED, "영상 파일을 읽을 수 없습니다.");
        }
        // Content-Type은 클라이언트가 보낸 값이라 위조할 수 있다. 내용으로 한 번 더 확인한다
        if (!isMp4(bytes)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "mp4 영상이 아닙니다. 확장자만 바꾼 파일은 올릴 수 없습니다.");
        }

        String path = "%d/%d-%s.mp4".formatted(memberId, System.currentTimeMillis(), randomSuffix());
        return new ShortsVideoResponse(storageClient.upload(path, bytes, VIDEO_MIME));
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
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Shorts shorts = Shorts.upload(memberId, request.videoUrl().trim(),
                blankToNull(request.thumbnailUrl()), blankToNull(request.caption()),
                request.durationSec());
        shortsRepository.save(shorts);

        return ShortsResponse.of(shorts, member.getName());
    }

    /**
     * 피드 조회. 로그인 없이도 볼 수 있는 공개 조회다 (shorts_guide_1.md 7절 — 업로드·좋아요만 인증 필요).
     *
     * @param viewerId 보는 사람. 비로그인이면 null이고, 이때 likedByMe는 모두 false다
     * @param cursor   마지막으로 본 항목의 id. null이면 처음부터
     * @param limit    가져올 개수. null이면 10개, 상한 30개
     */
    @Transactional(readOnly = true)
    public ShortsFeedResponse getFeed(Long viewerId, Long cursor, Integer limit) {
        int size = normalizeLimit(limit);
        long effectiveCursor = (cursor == null) ? Long.MAX_VALUE : cursor;

        // size + 1개를 조회해 "다음 페이지가 있는지"를 판단한다.
        // 딱 size개만 가져오면 마지막 페이지인지 알 수 없어 빈 페이지를 한 번 더 요청하게 된다
        List<ShortsResponse> rows =
                shortsRepository.findFeed(effectiveCursor, PageRequest.of(0, size + 1));

        boolean hasNext = rows.size() > size;
        List<ShortsResponse> items = hasNext ? List.copyOf(rows.subList(0, size)) : rows;
        Long nextCursor = hasNext ? items.get(items.size() - 1).id() : null;

        return new ShortsFeedResponse(fillLikedByMe(items, viewerId), nextCursor);
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

    // mp4(ISO BMFF) 여부: [0..3]은 박스 크기, [4..7]이 'ftyp'이어야 한다
    private boolean isMp4(byte[] bytes) {
        if (bytes.length < 12) {
            return false;
        }
        for (int i = 0; i < MP4_FTYP.length; i++) {
            if (bytes[4 + i] != MP4_FTYP[i]) {
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
