package com.pet.backend.member;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 리프레시 토큰 발급·검증 (docs/api-spec.md 1절).
 * 토큰은 JWT가 아니라 **의미 없는 난수**다 — 서버 DB가 유일한 진실이라 즉시 폐기가 가능하다.
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    // 명세 고정값(Set-Cookie의 Max-Age=1209600과 같은 값). 환경마다 다를 값이 아니라 .env로 빼지 않았다
    public static final Duration TOKEN_TTL = Duration.ofDays(14);

    /**
     * 회전 직후 같은 토큰이 다시 와도 침해로 보지 않는 유예 (리뷰 백로그 32번).
     *
     * 없으면 정상 사용이 침해로 오인된다 — 재발급 응답이 브라우저에 닿기 전에 새로고침하면
     * 서버는 회전을 커밋했는데 쿠키는 옛 토큰으로 남아, 다음 재발급이 **반드시** 재사용으로 판정된다.
     * 탭 두 개가 동시에 재발급할 때도 같다(프론트의 single-flight는 탭 하나 안에서만 유효).
     * 응답 유실·탭 경합은 수 초 안에 끝나므로 30초면 넉넉하고, 그만큼만 감지가 느슨해진다.
     */
    private static final Duration ROTATION_GRACE = Duration.ofSeconds(30);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenReuseHandler reuseHandler;

    /**
     * 새 세션(=기기)으로 토큰을 발급하고 해시만 저장한 뒤 **원문**을 돌려준다. 원문은 이 순간 이후
     * 서버 어디에도 남지 않으며, 호출자가 쿠키로 내보내는 것 외에 쓸 곳이 없다.
     * 로그인·비밀번호 변경 재발급이 쓴다 — 세션 id가 새로 나가고 기기 정보도 이 시점 것으로 저장된다.
     */
    @Transactional
    public String issue(Long memberId, String deviceInfo) {
        return persistNewToken(memberId, UUID.randomUUID(), deviceInfo, Instant.now());
    }

    /**
     * 회전(rotation): 받은 토큰을 폐기하고 새 토큰을 발급한다. 원문을 돌려준다.
     * 새 행은 기존 토큰의 세션 정보(session_id·device_info·session_started_at)를 이어받는다 —
     * 기기 목록에서 회전이 "같은 기기의 계속"으로 보이게 하는 근거다 (api-spec.md 1절 5차).
     *
     * <p>검증은 {@link #findUsableOrThrow}가 따로 담당한다 — 그 사이에 호출자가 회원 행을
     * 공유 잠금으로 읽고 `tokens_valid_from`을 확인해야 하기 때문이다 (리뷰 백로그 77번).
     * 넘겨받는 token은 호출자 트랜잭션에서 조회한 **영속 상태**여야 폐기가 반영된다.
     */
    @Transactional
    public String rotate(RefreshToken token) {
        token.revoke(RevokedReason.ROTATED);
        return persistNewToken(token.getMemberId(), token.getSessionId(),
                token.getDeviceInfo(), token.getSessionStartedAt());
    }

    /**
     * 비밀번호 변경 — 그 회원의 활성 토큰을 **전부** 폐기하고(다른 기기 로그아웃, 유예 없음)
     * 변경한 기기에만 새 토큰을 발급한다 (docs/api-spec.md 1절, a안). 기존 세션 체인이 방금 끊겼으므로
     * 새 세션으로 시작한다. 폐기가 발급보다 먼저여야 한다 — 순서가 반대면 방금 발급한 토큰까지 쓸려 나간다.
     */
    @Transactional
    public String reissueAfterPasswordChange(Long memberId, String deviceInfo) {
        refreshTokenRepository.revokeAllByMemberId(memberId, Instant.now(), RevokedReason.PASSWORD_CHANGED);
        return persistNewToken(memberId, UUID.randomUUID(), deviceInfo, Instant.now());
    }

    // 트랜잭션 없는 공용 헬퍼 — rotate()가 같은 빈의 @Transactional issue()를 자기호출하던 패턴 제거 (백로그 39번).
    // 프록시를 타지 않아 @Transactional이 무시되는 자리였고, 이 파일이 바로 그 이유로 ReuseHandler를 분리한 파일이다
    private String persistNewToken(Long memberId, UUID sessionId, String deviceInfo, Instant sessionStartedAt) {
        String rawToken = generateToken();
        refreshTokenRepository.save(RefreshToken.issue(
                memberId, hash(rawToken), Instant.now().plus(TOKEN_TTL),
                sessionId, deviceInfo, sessionStartedAt));
        return rawToken;
    }

    /** 로그아웃 — 해당 토큰만 폐기한다(다른 기기는 유지). 쿠키가 없거나 이미 죽은 토큰이어도 조용히 넘어간다(멱등). */
    @Transactional
    public void revoke(String rawToken) {
        revokeIfActive(rawToken, RevokedReason.LOGOUT);
    }

    /**
     * 회원 탈퇴 — 전 기기의 활성 토큰을 일괄 폐기한다 (docs/api-spec.md 1절 6차).
     * 재발급이 없다는 점만 비밀번호 변경과 다르다. 일괄 UPDATE가 놓치는 토큰(회전 유예 안·발급 진행 중)은
     * 호출자가 같은 트랜잭션에서 갱신하는 `tokens_valid_from`(Member.withdraw)이 차단한다.
     */
    @Transactional
    public void revokeAllOnWithdraw(Long memberId) {
        refreshTokenRepository.revokeAllByMemberId(memberId, Instant.now(), RevokedReason.WITHDRAWN);
    }

    /**
     * 재로그인이 쿠키의 이전 토큰을 대체 폐기 (백로그 37번 — 유령 기기 방지).
     * LOGOUT과 사유를 구분하는 이유: 로그인 응답(Set-Cookie) 유실·탭 경합으로 이 토큰이 다시 제출될 수 있는데,
     * 그때 재사용 감지(전체 폐기)가 발동하면 방금 로그인한 기기까지 끊긴다 — 단순 401로 끝나야 한다
     * ({@link RevokedReason#exemptFromReuseDetection}).
     */
    @Transactional
    public void revokeReplacedByLogin(String rawToken) {
        revokeIfActive(rawToken, RevokedReason.REPLACED_BY_LOGIN);
    }

    private void revokeIfActive(String rawToken, RevokedReason reason) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokenRepository.findByTokenHash(hash(rawToken))
                .filter(token -> !token.isRevoked())
                .ifPresent(token -> token.revoke(reason));
    }

    /** 쿠키 토큰이 속한 세션 id — 현재 기기 판별용. 쿠키가 없거나 DB에 없으면 null (폐기 여부는 따지지 않는다). */
    @Transactional(readOnly = true)
    public UUID findSessionIdOf(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return null;
        }
        return refreshTokenRepository.findByTokenHash(hash(rawToken))
                .map(RefreshToken::getSessionId)
                .orElse(null);
    }

    /** 회원의 활성(미폐기) 토큰 전부 — 기기 목록의 원천. 만료 필터링·세션 묶기는 호출자(MemberService) 몫. */
    @Transactional(readOnly = true)
    public List<RefreshToken> findActiveTokens(Long memberId) {
        return refreshTokenRepository.findAllByMemberIdAndRevokedAtIsNull(memberId);
    }

    /**
     * 기기(세션) 원격 로그아웃 — 그 세션의 활성 토큰을 **전부** 폐기한다 (api-spec.md 1절 5차).
     * 세션 단위 폐기라 회전 유예 안의 직전 토큰·유예 중복 회전이 남긴 고아까지 함께 죽는다.
     * 반환값은 폐기된 행 수 — 0이면 그 세션은 이 회원 것이 아니거나 이미 끊겨 있다.
     */
    @Transactional
    public int revokeSession(Long memberId, UUID sessionId) {
        return refreshTokenRepository.revokeAllBySession(
                memberId, sessionId, Instant.now(), RevokedReason.DEVICE_REVOKED);
    }

    /**
     * 제출된 토큰을 찾아 "지금 쓸 수 있는가"까지 판정한다 (만료·폐기·재사용 감지).
     * 한 토큰은 한 번만 쓰이므로, 폐기된 토큰이 다시 오면 복사본이 돌아다닌다는 뜻으로 보고
     * 그 회원의 활성 토큰을 전부 끊는다 (docs/api-spec.md 1절 재사용 감지).
     *
     * <p>호출자(MemberService.refresh)의 트랜잭션 안에서 실행된다 — 여기서 돌려준 엔티티를
     * 그 트랜잭션이 계속 쓰기 때문에 별도 트랜잭션으로 끊으면 안 된다.
     */
    RefreshToken findUsableOrThrow(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        }
        // 폐기된 토큰도 찾아야 재사용을 감지할 수 있어 상태로 거르지 않고 조회한다
        RefreshToken token = refreshTokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN));

        if (token.isExpired()) {
            throw new BusinessException(ErrorCode.AUTH_REFRESH_EXPIRED);
        }
        if (token.isRevoked() && !token.isWithinRotationGrace(ROTATION_GRACE)) {
            // 폐기당한 쪽이 폐기 사실을 모른 채 재제출하는 것이 **보장된 정상 동작**인 사유들이 있다 —
            // PASSWORD_CHANGED·DEVICE_REVOKED는 다른 기기의 자동 재발급, REPLACED_BY_LOGIN은
            // 로그인 응답 유실·탭 경합. 재사용 감지로 취급하면 그 revokeAll이 정상 기기의 새 토큰까지 죽여
            // "현재 기기는 유지"가 무력화된다. 전체 폐기 없이 재로그인만 요구한다 (RevokedReason 주석 참조).
            if (token.getRevokedReason().exemptFromReuseDetection()) {
                throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
            }
            // 유예를 넘긴 폐기 토큰 제출 — 정상 플로우에서는 나올 수 없다. 유출로 보고 세션을 전부 끊는다.
            // 아래 예외가 이 요청의 트랜잭션을 롤백시키므로 폐기는 별도 트랜잭션에서 커밋해야 한다
            reuseHandler.revokeAllOf(token.getMemberId());
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        }
        // 유예 안의 회전된 토큰은 그대로 진행한다 — 호출자가 다시 revoke하고 새 토큰을 발급한다.
        // 그 사이 발급됐던 토큰도 살아 있게 되지만(고아, 백로그 37번), 정상 사용자를
        // 전 기기 로그아웃시키는 것보다 낫다는 판단
        return token;
    }

    // 256비트 난수 → URL 안전 Base64(패딩 없음) 43자
    private String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    // 조회 키로도 쓰이므로 salt 없는 고정 해시여야 한다 (원문 자체가 고엔트로피 난수라 사전 공격 대상이 아니다)
    String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256은 모든 JVM이 제공하도록 규격에 명시돼 있어 실제로는 도달하지 않는다
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", e);
        }
    }
}
