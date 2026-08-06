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

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenReuseHandler reuseHandler;

    /**
     * 새 토큰을 발급하고 해시만 저장한 뒤 **원문**을 돌려준다. 원문은 이 순간 이후 서버 어디에도 남지 않으며,
     * 호출자가 쿠키로 내보내는 것 외에 쓸 곳이 없다.
     */
    @Transactional
    public String issue(Long memberId) {
        String rawToken = generateToken();
        refreshTokenRepository.save(
                RefreshToken.issue(memberId, hash(rawToken), Instant.now().plus(TOKEN_TTL)));
        return rawToken;
    }

    // 회전 결과 — 누구의 토큰이었는지와 새로 발급한 원문
    public record Rotated(Long memberId, String rawToken) {}

    /**
     * 회전(rotation): 받은 토큰을 검증·폐기하고 새 토큰을 발급한다.
     * 한 토큰은 한 번만 쓰이므로, 폐기된 토큰이 다시 오면 복사본이 돌아다닌다는 뜻으로 보고
     * 그 회원의 활성 토큰을 전부 끊는다 (docs/api-spec.md 1절 재사용 감지).
     */
    @Transactional
    public Rotated rotate(String rawToken) {
        RefreshToken token = findActiveOrThrow(rawToken);
        token.revoke();
        Long memberId = token.getMemberId();
        return new Rotated(memberId, issue(memberId));
    }

    /** 로그아웃 — 해당 토큰만 폐기한다(다른 기기는 유지). 쿠키가 없거나 이미 죽은 토큰이어도 조용히 넘어간다(멱등). */
    @Transactional
    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokenRepository.findByTokenHash(hash(rawToken))
                .filter(token -> !token.isRevoked())
                .ifPresent(RefreshToken::revoke);
    }

    private RefreshToken findActiveOrThrow(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        }
        // 폐기된 토큰도 찾아야 재사용을 감지할 수 있어 상태로 거르지 않고 조회한다
        RefreshToken token = refreshTokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN));

        if (token.isRevoked()) {
            // 정상 플로우에서는 나올 수 없는 요청 — 유출로 보고 그 회원 세션을 전부 끊는다.
            // 아래 예외가 이 요청의 트랜잭션을 롤백시키므로 폐기는 별도 트랜잭션에서 커밋해야 한다
            reuseHandler.revokeAllOf(token.getMemberId());
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        }
        if (token.isExpired()) {
            throw new BusinessException(ErrorCode.AUTH_REFRESH_EXPIRED);
        }
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
