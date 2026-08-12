package com.pet.backend.member;

import com.pet.backend.chat.ChatLeftReason;
import com.pet.backend.chat.ChatRoomMemberRepository;
import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.common.ImageStorageClient;
import java.io.IOException;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import com.pet.backend.member.dto.KakaoLoginRequest;
import com.pet.backend.member.dto.SessionResponse;
import com.pet.backend.member.dto.WithdrawRequest;
import com.pet.backend.member.dto.LoginRequest;
import com.pet.backend.member.dto.LoginResponse;
import com.pet.backend.member.dto.MemberResponse;
import com.pet.backend.member.dto.NameUpdateRequest;
import com.pet.backend.member.dto.PasswordChangeRequest;
import com.pet.backend.member.dto.SignupRequest;
import com.pet.backend.member.dto.TokenResponse;
import com.pet.backend.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class MemberService {

    // 소셜 계정의 탈퇴 확인 문구 — 프론트와 계약 (docs/api-spec.md 1절 6차)
    static final String WITHDRAW_CONFIRM_PHRASE = "탈퇴합니다";

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenService refreshTokenService;
    private final KakaoOAuthClient kakaoOAuthClient;
    private final ImageStorageClient imageStorageClient;
    // 사진 URL 저장만 담당하는 짧은 트랜잭션 (백로그 80번 — 클래스 주석 참고)
    private final MemberProfileImageUpdater memberProfileImageUpdater;
    // 도메인 경계를 넘는 유일한 의존 — 탈퇴가 "방장 방 검사 → 참여 방 정리"를 회원 삭제와
    // **같은 트랜잭션**에서 해야 해서(중간 실패 시 함께 롤백) 이벤트로 분리할 수 없다.
    // 서비스가 아니라 리포지토리를 물어 chat 도메인 규칙(권한 검증 등)은 끌어오지 않는다
    private final ChatRoomMemberRepository chatRoomMemberRepository;

    @Transactional
    public MemberResponse signup(SignupRequest request) {
        if (memberRepository.existsByEmailAndDeletedAtIsNull(request.email())) {
            throw new BusinessException(ErrorCode.AUTH_EMAIL_DUPLICATED);
        }
        Member member = Member.createLocalMember(
                request.email(),
                passwordEncoder.encode(request.password()),
                request.name());
        try {
            memberRepository.save(member);
        } catch (DataIntegrityViolationException e) {
            // 중복 검사와 INSERT 사이에 같은 이메일이 먼저 가입한 경쟁 상황 —
            // DB 부분 UNIQUE 인덱스(ux_pet_member_email_active) 위반을 409로 변환
            throw new BusinessException(ErrorCode.AUTH_EMAIL_DUPLICATED);
        }
        return MemberResponse.from(member);
    }

    /**
     * 로그인. 이메일 없음 / 비밀번호 불일치 / 탈퇴 계정 / 소셜 계정을 전부
     * 같은 AUTH_INVALID_CREDENTIALS로 응답한다 — 계정 존재 여부 노출 방지 (docs/api-spec.md 1절).
     */
    @Transactional
    public LoginResult login(LoginRequest request, String priorRefreshToken, String deviceInfo) {
        Member member = memberRepository.findByEmailAndDeletedAtIsNull(request.email())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS));
        // password가 NULL인 소셜 계정은 자체 로그인 불가
        if (member.getPassword() == null || !matchesSafely(request.password(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        return issueLoginTokens(member, priorRefreshToken, deviceInfo);
    }

    /**
     * 카카오 로그인 (docs/api-spec.md 1절 4차). 첫 로그인이면 자동 가입한다.
     * 응답 계약은 자체 로그인과 완전히 동일 — 프론트는 code 전달 이후를 구분할 필요가 없다.
     *
     * <p>uploadProfileImage와 같은 이유로 **의도적인 비트랜잭션**이다 (리뷰 백로그 76번).
     * @Transactional을 걸면 Hibernate가 트랜잭션 시작 시점에 잡은 DB 커넥션을 카카오 REST 왕복
     * 2회(토큰 교환 → 사용자 조회)가 끝날 때까지 쥐고 있는다. 풀 크기가 2인 환경에서는
     * 카카오 로그인 2건이 겹치는 것만으로 풀이 비어 채팅·pet 등 모든 요청이
     * connectionTimeout까지 대기하다 500이 된다.
     *
     * <p>대신 조회·가입·토큰 발급이 각각 자체 트랜잭션으로 처리된다. 원자성은 잃지만
     * 중간 실패로 남는 것은 "가입은 됐지만 토큰을 못 받은 계정"뿐이고, 다음 로그인이 그 행을
     * 그대로 찾아 이어받으므로 사용자에게는 재시도 한 번으로 끝난다.
     */
    public LoginResult kakaoLogin(KakaoLoginRequest request, String priorRefreshToken, String deviceInfo) {
        KakaoOAuthClient.KakaoUserInfo userInfo =
                kakaoOAuthClient.fetchUser(request.code(), request.redirectUri());
        Member member = memberRepository
                .findByProviderAndProviderIdAndDeletedAtIsNull(Provider.KAKAO, userInfo.providerId())
                .orElseGet(() -> registerKakaoMember(userInfo));
        return issueLoginTokens(member, priorRefreshToken, deviceInfo);
    }

    private Member registerKakaoMember(KakaoOAuthClient.KakaoUserInfo userInfo) {
        // 이메일은 카카오의 선택 동의 항목이라 없을 수 있다 — 미제공이면 null로 가입한다
        // (2026-08-10 개정, docs/api-spec.md 1절 4차. placeholder 이메일은 채우지 않는다)
        String email = (userInfo.email() == null || userInfo.email().isBlank())
                ? null
                : userInfo.email();
        // 같은 이메일의 자체 가입 계정이 있으면 자동 연결하지 않고 거부한다 —
        // 카카오 이메일 검증을 신뢰하면 계정 탈취 벡터가 되고, 한 계정 = 한 provider 스키마와도 맞지 않는다
        if (email != null && memberRepository.existsByEmailAndDeletedAtIsNull(email)) {
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_EMAIL_CONFLICT);
        }
        String name = (userInfo.nickname() == null || userInfo.nickname().isBlank())
                ? "카카오 회원"
                : userInfo.nickname().trim();
        if (name.length() > 50) {
            name = name.substring(0, 50); // name VARCHAR(50) — 카카오 닉네임 상한이 더 짧지만 방어
        }
        try {
            return memberRepository.save(
                    Member.createKakaoMember(email, name, userInfo.providerId()));
        } catch (DataIntegrityViolationException e) {
            // 같은 카카오 계정의 동시 첫 로그인 경쟁(ux_pet_member_provider_active) — 먼저 들어간 행으로 로그인.
            //
            // 이 흡수는 **호출자가 비트랜잭션일 때만** 성립한다 (백로그 78번). 바깥 트랜잭션이 있으면
            // save()가 거기에 참여해 제약 위반 순간 rollback-only가 찍히고, 여기서 정상 반환해도
            // 커밋에서 UnexpectedRollbackException → 500이 된다. kakaoLogin의 @Transactional을
            // 되살리려는 사람은 이 catch가 함께 죽는다는 것을 알아야 한다.
            return memberRepository
                    .findByProviderAndProviderIdAndDeletedAtIsNull(Provider.KAKAO, userInfo.providerId())
                    .orElseGet(() -> {
                        // 카카오 계정 인덱스 충돌이 아니었다. 사전 검사와 INSERT 사이에 같은 이메일이
                        // 먼저 가입한 경우만 409로 안내하고, 그 밖의 제약 위반(예: provider 무결성 CHECK)은
                        // 원인을 "이메일 충돌"로 덮어쓰지 않고 그대로 올린다
                        if (email != null && memberRepository.existsByEmailAndDeletedAtIsNull(email)) {
                            throw new BusinessException(ErrorCode.AUTH_SOCIAL_EMAIL_CONFLICT);
                        }
                        throw e;
                    });
        }
    }

    // 로그인마다 새 세션의 리프레시 토큰을 발급한다 — 기기별로 따로 살아 있고, 로그아웃도 그 기기만 끊긴다
    private LoginResult issueLoginTokens(Member member, String priorRefreshToken, String deviceInfo) {
        // 요청 쿠키에 실려온 이전 토큰은 폐기한다 (리뷰 백로그 37번) — 곧 새 쿠키로 덮여
        // 브라우저에서 도달 불가한 고아가 될 토큰이고, 남겨두면 기기 목록(5차)에 유령 기기로 잔존한다.
        // 다른 계정의 토큰이어도 마찬가지다: 이 기기의 쿠키가 바뀌는 순간 어차피 죽은 토큰이다 (멱등, null 안전)
        refreshTokenService.revokeReplacedByLogin(priorRefreshToken);
        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        String refreshToken = refreshTokenService.issue(member.getId(), deviceInfo);
        return new LoginResult(
                LoginResponse.of(accessToken, jwtTokenProvider.expirationSeconds(), member),
                refreshToken);
    }

    /**
     * 액세스 토큰 재발급 + 리프레시 토큰 회전 (docs/api-spec.md 1절).
     * 회전·재사용 감지는 RefreshTokenService가, 새 액세스 토큰 발급은 여기서 담당한다.
     */
    @Transactional
    public RefreshResult refresh(String rawRefreshToken) {
        RefreshToken token = refreshTokenService.findUsableOrThrow(rawRefreshToken);

        // 회원을 **회전 전에, 공유 잠금으로** 읽는다 (리뷰 백로그 77번).
        // 그 사이 탈퇴했거나 role이 바뀌었을 수 있어 어차피 필요한 조회이고, 잠금만 얹었다.
        // 잠금이 없으면 "검사 통과 → 비밀번호 변경 커밋 → 새 토큰 INSERT" 순서가 성립해
        // 일괄 폐기를 빠져나간 토큰이 14일 살아남는다. 유출 대응이 목적인 기능이라 그 창을 남기지 않는다
        Member member = memberRepository.findByIdForShare(token.getMemberId())
                .filter(m -> !m.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN));

        // 비밀번호 변경 이전에 발급된 토큰은 거부한다. 일괄 폐기(revokeAllByMemberId)는
        // "그 순간 살아 있던 행"만 잡기 때문에 **회전 유예(30초) 안이라 이미 ROTATED로 폐기돼 있던 토큰**을
        // 건드리지 못한다 — 그 토큰은 유예 규칙상 재발급을 통과하므로, 이 검사가 없으면
        // 비밀번호를 바꿔도 공격자가 새 토큰을 받아 간다
        if (member.isTokenInvalidated(token.getCreatedAt())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        }

        String newRawToken = refreshTokenService.rotate(token);
        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        return new RefreshResult(
                TokenResponse.of(accessToken, jwtTokenProvider.expirationSeconds()),
                newRawToken);
    }

    // 로그아웃 — 쿠키의 리프레시 토큰만 폐기한다 (쿠키가 없어도 성공, 멱등)
    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokenService.revoke(rawRefreshToken);
    }

    /**
     * 비밀번호 변경 (docs/api-spec.md 1절). 유출 의심 대응이 대표 목적이므로 다른 기기의
     * 리프레시 토큰을 전부 폐기하고, 변경한 기기에만 새 토큰을 발급해 로그인을 유지한다.
     * 반환값은 새 리프레시 토큰 원문 — 호출자(Controller)가 쿠키로 내보낸다.
     *
     * 소셜 계정(password NULL)도 현재 비밀번호 불일치와 같은 코드로 거부한다 — 로그인과
     * 같은 이유로 계정 유형을 노출하지 않는다.
     */
    @Transactional
    public String changePassword(Long memberId, PasswordChangeRequest request, String deviceInfo) {
        Member member = findActiveMemberOrThrow(memberId);
        if (member.getPassword() == null
                || !matchesSafely(request.currentPassword(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        // 같은 비밀번호로의 "변경"은 거부한다 (2026-08-10 확정) — 유출 대응이 목적인 기능인데
        // 같은 값이면 아무것도 바뀌지 않으면서 다른 기기만 로그아웃되는 어리둥절한 결과가 된다
        if (matchesSafely(request.newPassword(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_PASSWORD_UNCHANGED);
        }
        member.changePassword(passwordEncoder.encode(request.newPassword()));
        // 기존 세션 체인이 일괄 폐기로 끊기므로 새 세션으로 시작한다 (UA 재수집 — api-spec.md 1절 5차)
        return refreshTokenService.reissueAfterPasswordChange(memberId, deviceInfo);
    }

    /**
     * 로그인 기기(세션) 목록 (docs/api-spec.md 1절 5차). 활성 토큰 행을 세션으로 묶으면 그대로 기기 목록이다.
     * rawRefreshToken은 현재 기기 판별용 — 쿠키가 없으면(LAN 등) 전부 current=false로 내려간다.
     */
    @Transactional(readOnly = true)
    public List<SessionResponse> getSessions(Long memberId, String rawRefreshToken) {
        findActiveMemberOrThrow(memberId);
        UUID currentSessionId = refreshTokenService.findSessionIdOf(rawRefreshToken);
        Map<UUID, List<RefreshToken>> chains = refreshTokenService.findActiveTokens(memberId).stream()
                .filter(token -> !token.isExpired()) // 만료됐지만 폐기 안 된 행은 기기가 아니다 (정리 배치 전까지 잔존)
                .collect(Collectors.groupingBy(RefreshToken::getSessionId));
        return chains.entrySet().stream()
                .map(entry -> SessionResponse.of(entry.getValue(), entry.getKey().equals(currentSessionId)))
                .sorted(Comparator.comparing(SessionResponse::current, Comparator.reverseOrder())
                        .thenComparing(SessionResponse::lastUsedAt, Comparator.reverseOrder()))
                .toList();
    }

    /**
     * 다른 기기 원격 로그아웃 (docs/api-spec.md 1절 5차). 현재 기기는 400으로 거부한다 —
     * 프론트가 버튼을 숨기지만 버튼 숨김은 방어가 아니므로 서버가 최종 거부한다 (현재 기기 종료는 기존 로그아웃).
     */
    @Transactional
    public void revokeSession(Long memberId, String rawSessionId, String rawRefreshToken) {
        findActiveMemberOrThrow(memberId);
        UUID sessionId;
        try {
            sessionId = UUID.fromString(rawSessionId);
        } catch (IllegalArgumentException e) {
            // 형식 오류도 404 — 존재 여부 비노출(5절 규칙)과 일치하고, 경로 타입 오류가 500이 되는
            // 계열(백로그 13번)을 새로 만들지 않기 위해 UUID 파싱을 여기서 흡수한다
            throw new BusinessException(ErrorCode.AUTH_SESSION_NOT_FOUND);
        }
        if (sessionId.equals(refreshTokenService.findSessionIdOf(rawRefreshToken))) {
            throw new BusinessException(ErrorCode.AUTH_SESSION_CURRENT);
        }
        // memberId 조건이 쿼리에 있어 남의 세션은 0행 → 404 (존재 여부가 새지 않는다)
        if (refreshTokenService.revokeSession(memberId, sessionId) == 0) {
            throw new BusinessException(ErrorCode.AUTH_SESSION_NOT_FOUND);
        }
    }

    /**
     * 회원 탈퇴 (docs/api-spec.md 1절 6차). 단일 트랜잭션 — 본인 확인 → 방장 방 검사(409) →
     * 참여 방 일괄 나가기 → 소프트 삭제(+tokens_valid_from) → 전 토큰 폐기.
     * 반려동물 데이터는 건드리지 않는다(소유자 격리로 접근 경로가 없고, 생체정보 테이블이 pet_id 참조).
     */
    @Transactional
    public void withdraw(Long memberId, WithdrawRequest request) {
        Member member = findActiveMemberOrThrow(memberId);
        verifyWithdrawIdentity(member, request);
        // 방장(OWNER)인 활성 방이 있으면 거부 — "방장은 위임 후에만 나가기"와 일관.
        // 방치하면 위임·삭제가 영구 불가능한 방장 부재 방이 남는다 (2026-08-11 확정)
        if (chatRoomMemberRepository.existsActiveOwnedRoom(memberId)) {
            throw new BusinessException(ErrorCode.WITHDRAW_CHAT_OWNER);
        }
        // 엔티티 변경은 반드시 벌크 UPDATE들보다 **먼저** — 아래 벌크의 clearAutomatically가
        // 영속성 컨텍스트를 비워 member가 detach되면, 그 뒤의 변경은 커밋에 반영되지 않고 유실된다
        // (백로그 99번이 경고한 전염 사례 — 검증에서 실제로 소프트 삭제가 유실돼 순서를 못 박음).
        // 이 변경 자체는 벌크의 flushAutomatically가 UPDATE로 함께 내보낸다
        member.withdraw(); // deleted_at + tokens_valid_from (Member.withdraw 주석 참조)
        chatRoomMemberRepository.leaveAllByMemberId(memberId, Instant.now(), ChatLeftReason.LEFT);
        refreshTokenService.revokeAllOnWithdraw(memberId);
    }

    /**
     * 탈퇴 본인 확인 — LOCAL은 현재 비밀번호, 소셜은 확인 문구 (2026-08-11 확정).
     * 소셜 계정에는 password가 없어(NULL) 비밀번호 재입력이라는 확인 수단 자체가 성립하지 않는다.
     */
    private void verifyWithdrawIdentity(Member member, WithdrawRequest request) {
        if (member.getProvider() == Provider.LOCAL) {
            if (member.getPassword() == null
                    || !matchesSafely(request.password(), member.getPassword())) {
                throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
            }
            return;
        }
        if (!WITHDRAW_CONFIRM_PHRASE.equals(request.confirmPhrase())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "확인 문구가 일치하지 않습니다. \"" + WITHDRAW_CONFIRM_PHRASE + "\"를 입력해 주세요.");
        }
    }

    /**
     * 비밀번호 대조. 로그인 요청은 길이를 제한하지 않으므로(형식 검증을 걸지 않는 정책 — LoginRequest 주석)
     * BCrypt 한계를 넘는 입력이 그대로 들어올 수 있다. 예외가 새면 로그인 실패가 500이 되고
     * 그 자체로 계정 존재 여부의 단서가 되므로 "불일치"로 흡수한다.
     *
     * 현재 Spring Security의 matches()는 72바이트 초과분을 잘라내고 비교할 뿐 예외를 던지지 않는다
     * (예외는 encode()만 던진다 — 그쪽은 SignupRequest의 @MaxBytes(72)가 막는다).
     * 이 방어는 버전이 올라가 matches()도 던지게 될 때를 위한 것이다.
     */
    private boolean matchesSafely(String rawPassword, String encodedPassword) {
        try {
            return passwordEncoder.matches(rawPassword, encodedPassword);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * 프로필 사진 업로드 (docs/api-spec.md 1절). PetService.uploadProfileImage와 같은 구조 —
     * Storage 업로드(외부 HTTP) 동안 커넥션을 점유하지 않도록 의도적으로 비트랜잭션이고,
     * 저장만 {@link MemberProfileImageUpdater}의 짧은 트랜잭션에 맡긴다 (리뷰 백로그 80번 —
     * 저장까지 트랜잭션 밖에 두면 detached merge가 password·tokens_valid_from까지 옛 값으로 되돌린다).
     */
    public MemberResponse uploadProfileImage(Long memberId, MultipartFile file) {
        imageStorageClient.validateImage(file);
        // 업로드 전에 활성 회원 확인 — 탈퇴 계정의 토큰으로 스토리지 쓰기가 일어나지 않게
        findActiveMemberOrThrow(memberId);

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }
        // 확장자 없는 고정 경로 + 덮어쓰기 — 고아 파일 방지 (ImageStorageClient 주석)
        String url = imageStorageClient.upload("member-" + memberId, bytes, file.getContentType());

        Member member = memberProfileImageUpdater.apply(
                memberId, url + "?v=" + Instant.now().toEpochMilli());
        return MemberResponse.from(member);
    }

    // 활성 조건이 쿼리에 있는 조회로 통일 (백로그 95번 해소 — 이전에는 findById().filter 복붙이 4곳)
    private Member findActiveMemberOrThrow(Long memberId) {
        return memberRepository.findByIdAndDeletedAtIsNull(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    // 이름 수정 (docs/api-spec.md 1절). 검증 규칙은 가입과 동일, 저장 전 trim
    @Transactional
    public MemberResponse updateName(Long memberId, NameUpdateRequest request) {
        Member member = findActiveMemberOrThrow(memberId);
        member.changeName(request.name().trim());
        return MemberResponse.from(member);
    }

    // 토큰은 유효하지만 그 사이 탈퇴한 계정일 수 있으므로 활성 여부까지 확인한다
    @Transactional(readOnly = true)
    public MemberResponse getMyInfo(Long memberId) {
        Member member = findActiveMemberOrThrow(memberId);
        return MemberResponse.from(member);
    }
}
