package com.pet.backend.member;

import com.pet.backend.chat.ChatLeftReason;
import com.pet.backend.chat.ChatRoomMemberRepository;
import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import com.pet.backend.common.ImageStorageClient;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@RequiredArgsConstructor
public class MemberService {

    // 소셜 계정의 탈퇴 확인 문구 — 프론트와 계약 (docs/api-spec.md 1절 6차)
    static final String WITHDRAW_CONFIRM_PHRASE = "탈퇴합니다";

    // 카카오 가입 회원의 임의 이름 (generateKakaoName 주석 참조).
    // 접두어를 바꾸면 기존 회원 이름과 형태가 갈리므로 함부로 고치지 않는다 — 소급 변경은 하지 않기로 했다
    private static final String KAKAO_NAME_PREFIX = "카카오회원";
    private static final int KAKAO_NAME_ATTEMPTS = 5;

    // 이름 중복을 최종 차단하는 부분 UNIQUE 인덱스 이름 (schema.sql 1절).
    // 위반 예외에서 어느 인덱스가 걸렸는지 가려내는 데 쓴다 — duplicatedFieldOf 참조
    private static final String NAME_UNIQUE_INDEX = "ux_pet_member_name_active";

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
    // 탈퇴한 회원의 WebSocket 연결을 끊는 신호를 던진다 (백로그 110번).
    // 위 리포지토리 의존과 달리 이쪽은 같은 트랜잭션일 필요가 없어 이벤트로 분리했다 —
    // 이 서비스는 WebSocket을 모르고, 수신은 chat.websocket.ChatBroadcaster가 한다
    private final ApplicationEventPublisher eventPublisher;

    // 로그인 타이밍 균등화용 더미 해시 (리뷰 백로그 4번) — login 주석 참조.
    // 리터럴로 박지 않고 기동 시 실제 인코더로 1회 생성한다: 인코더 강도(cost)가 바뀌면
    // 더미 대조 시간도 같이 바뀌어야 균등화가 유지되는데, 리터럴은 그 순간부터 갈린다
    private String dummyPasswordHash;

    @PostConstruct
    void initDummyPasswordHash() {
        this.dummyPasswordHash = passwordEncoder.encode("timing-equalizer-dummy");
    }

    // login과 같은 이유로 의도적인 비트랜잭션 (리뷰 백로그 43번) — BCrypt encode(~수십 ms)가
    // 커넥션을 쥐지 않게 한다. 중복 검사·INSERT는 각각 자체 트랜잭션으로 돌며, 검사와 INSERT 사이
    // 경쟁은 원래부터 DB 부분 UNIQUE 인덱스가 최종 차단한다(아래 catch) — 원자성 손실이 없다
    public MemberResponse signup(SignupRequest request) {
        String email = normalizeEmail(request.email());
        if (memberRepository.existsActiveByNormalizedEmail(email)) {
            throw new BusinessException(MemberErrorCode.EMAIL_DUPLICATED);
        }
        // 이름은 **DTO(compact constructor)에서 이미 trim됐다** (백로그 96번).
        // 그래야 검증과 저장이 같은 값을 본다 — 여기서 다듬으면 @Size가 원문을 본 뒤라 늦다.
        // trim 자체가 필요한 이유는 그대로다: 안 하면 "  홍길동"과 "홍길동"이 서로 다른 이름이 되어
        // 중복 검사와 UNIQUE 인덱스를 나란히 빠져나간다
        String name = request.name();
        if (memberRepository.existsActiveByNormalizedName(normalizeName(name))) {
            throw new BusinessException(MemberErrorCode.NAME_DUPLICATED);
        }
        Member member = Member.createLocalMember(
                email,
                passwordEncoder.encode(request.password()),
                name);
        try {
            memberRepository.save(member);
        } catch (DataIntegrityViolationException e) {
            // 중복 검사와 INSERT 사이에 같은 값이 먼저 가입한 경쟁 상황 —
            // DB 부분 UNIQUE 인덱스 위반을 409로 변환한다.
            //
            // **어느 인덱스가 걸렸는지 예외 메시지로 판별한다.** 43번으로 비트랜잭션이 되어
            // registerKakaoMember처럼 재조회 판별도 가능해졌지만 바꾸지 않는다 — 메시지 판별은
            // 추가 질의가 없고, 판별 실패의 폴백(이메일 중복 안내)까지 이미 검증된 경로다
            throw new BusinessException(duplicatedFieldOf(e));
        }
        return MemberResponse.from(member);
    }

    /**
     * UNIQUE 위반이 어느 인덱스에서 났는지 가려낸다. PostgreSQL이
     * {@code duplicate key value violates unique constraint "ux_pet_member_name_active"} 형태로
     * 인덱스 이름을 실어 보내는 것에 기댄다 — <b>인덱스 이름이 사실상 계약</b>이므로
     * schema.sql에서 이름을 바꾸면 여기도 함께 바꿔야 한다.
     *
     * <p>모르는 위반은 이메일 중복으로 답한다(개편 전 동작 유지) — 이름 인덱스가 아직 없는 환경에서도
     * 종전과 똑같이 동작하게 하려는 것이다.
     */
    private static MemberErrorCode duplicatedFieldOf(DataIntegrityViolationException e) {
        Throwable cause = e.getMostSpecificCause();
        String message = cause.getMessage() == null ? "" : cause.getMessage();
        return message.contains(NAME_UNIQUE_INDEX)
                ? MemberErrorCode.NAME_DUPLICATED
                : MemberErrorCode.EMAIL_DUPLICATED;
    }

    /**
     * 로그인. 이메일 없음 / 비밀번호 불일치 / 탈퇴 계정 / 소셜 계정을 전부
     * 같은 AUTH_INVALID_CREDENTIALS로 응답한다 — 계정 존재 여부 노출 방지 (docs/api-spec.md 1절).
     *
     * <p>kakaoLogin과 같은 이유로 <b>의도적인 비트랜잭션</b>이다 (리뷰 백로그 43번).
     * BCrypt 대조는 수십~100ms짜리 CPU 연산인데 트랜잭션 안에 있으면 그동안 커넥션 1개를 쥔다 —
     * 풀 5 환경에서 동시 로그인 몇 건이면 나머지 요청 전부가 대기한다. 회원 조회(읽기)와
     * 토큰 폐기·발급(RefreshTokenService의 자체 @Transactional)이 각각 짧은 트랜잭션으로 돌고,
     * BCrypt는 그 사이 트랜잭션 밖에서 수행된다. 원자성 트레이드오프는 kakaoLogin과 동일하다 —
     * 이전 토큰 폐기(REPLACED_BY_LOGIN)와 새 발급 사이에 실패하면 이전 토큰만 죽는데,
     * 그 토큰은 어차피 새 쿠키로 덮여 죽을 운명이었고 재로그인 한 번으로 끝난다.
     */
    public LoginResult login(LoginRequest request, String priorRefreshToken, String deviceInfo) {
        Member member = memberRepository.findActiveByNormalizedEmail(normalizeEmail(request.email()))
                .orElse(null);
        // 계정 미존재·소셜 계정(password NULL)도 더미 해시에 대조를 1회 수행한다 (리뷰 백로그 4번).
        // 안 하면 실계정만 BCrypt 수십 ms가 걸려, 메시지를 통일해 둔 계정 존재 여부가
        // 응답 시간 측정으로 우회된다. 결과는 버린다 — 시간 균등화만이 목적이다
        if (member == null || member.getPassword() == null) {
            matchesSafely(request.password(), dummyPasswordHash);
            throw new BusinessException(MemberErrorCode.INVALID_CREDENTIALS);
        }
        if (!matchesSafely(request.password(), member.getPassword())) {
            throw new BusinessException(MemberErrorCode.INVALID_CREDENTIALS);
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
        // 자체 가입과 같은 규칙으로 정규화한다 — 안 하면 카카오가 준 대문자 이메일이
        // 소문자로 저장된 자체 계정과 다른 값이 되어 아래 충돌 검사를 그냥 통과한다 (백로그 2번)
        String email = normalizeEmail(userInfo.email());
        // 같은 이메일의 자체 가입 계정이 있으면 자동 연결하지 않고 거부한다 —
        // 카카오 이메일 검증을 신뢰하면 계정 탈취 벡터가 되고, 한 계정 = 한 provider 스키마와도 맞지 않는다
        if (email != null && memberRepository.existsActiveByNormalizedEmail(email)) {
            throw new BusinessException(MemberErrorCode.SOCIAL_EMAIL_CONFLICT);
        }
        try {
            return memberRepository.save(
                    Member.createKakaoMember(email, generateKakaoName(), userInfo.providerId()));
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
                        if (email != null && memberRepository.existsActiveByNormalizedEmail(email)) {
                            throw new BusinessException(MemberErrorCode.SOCIAL_EMAIL_CONFLICT);
                        }
                        throw e;
                    });
        }
    }

    /**
     * 카카오 가입 회원의 표시 이름을 만든다 — <b>카카오 닉네임은 쓰지 않는다</b>
     * (2026-08-13 확정, docs/plan-2026-08-13.md F3). 예: {@code 카카오회원482913}
     *
     * <p><b>순번(n번째 카카오 회원)이 아니라 난수인 이유</b>는 두 가지다.
     * ① 순번은 {@code max(id)+1} 같은 집계 조회가 필요한데 동시 가입에서 같은 값이 나온다.
     * ② 순번은 가입자 수를 그대로 노출한다. 카카오 회원번호(providerId)를 쓰지 않는 이유는
     * 더 분명하다 — 외부 서비스의 계정 식별자를 화면에 그대로 띄우는 셈이 된다.
     *
     * <p>중복이면 다시 뽑는다. 여기서 지는 경쟁(검사와 INSERT 사이)은 막지 못하며,
     * 최종 차단은 닉네임 유니크 인덱스를 넣는 F2가 맡는다.
     * <b>가입을 실패시키지 않는 것</b>이 이 메서드의 계약이다 — 그래서 재시도가 모두 실패하면
     * 예외 대신 사실상 겹치지 않는 값으로 마무리한다.
     */
    private String generateKakaoName() {
        for (int attempt = 0; attempt < KAKAO_NAME_ATTEMPTS; attempt++) {
            String candidate = KAKAO_NAME_PREFIX
                    + ThreadLocalRandom.current().nextInt(100_000, 1_000_000);
            // 리포지토리 규약대로 정규화해 넘긴다 (이 후보는 한글+숫자라 값이 바뀌지 않지만,
            // 규약을 여기서 어기면 다른 호출부가 그대로 따라 한다)
            if (!memberRepository.existsActiveByNormalizedName(normalizeName(candidate))) {
                return candidate;
            }
        }
        // 6자리 난수가 연속으로 겹혔다 — 확률상 사실상 오지 않는 경로다.
        // 도달했다면 회원 수가 예상 밖으로 많다는 뜻이므로 자릿수를 늘려 끝낸다
        log.warn("카카오 임의 이름 생성이 {}회 연속 중복 — UUID로 대체합니다", KAKAO_NAME_ATTEMPTS);
        return KAKAO_NAME_PREFIX + UUID.randomUUID().toString().substring(0, 8);
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
                .orElseThrow(() -> new BusinessException(MemberErrorCode.INVALID_REFRESH_TOKEN));

        // 잠금을 얻은 **뒤에** 이 기기가 그 사이 원격 로그아웃당했는지 DB에서 다시 본다 (리뷰 백로그 109번).
        // 위의 토큰 검증은 잠금 밖에서 끝나 그 창에 커밋된 세션 폐기를 놓치는데, 비밀번호 변경과 달리
        // tokens_valid_from을 건드리지 않아 바로 아래 검사에도 걸리지 않는다.
        // 회전보다 앞이어야 한다 — 회전이 옛 스냅샷으로 DEVICE_REVOKED를 덮어쓰면 그 뒤엔 확인할 흔적이 없다
        if (refreshTokenService.isRevokedByDeviceLogout(token)) {
            throw new BusinessException(MemberErrorCode.INVALID_REFRESH_TOKEN);
        }

        // 비밀번호 변경 이전에 발급된 토큰은 거부한다. 일괄 폐기(revokeAllByMemberId)는
        // "그 순간 살아 있던 행"만 잡기 때문에 **회전 유예(30초) 안이라 이미 ROTATED로 폐기돼 있던 토큰**을
        // 건드리지 못한다 — 그 토큰은 유예 규칙상 재발급을 통과하므로, 이 검사가 없으면
        // 비밀번호를 바꿔도 공격자가 새 토큰을 받아 간다
        if (member.isTokenInvalidated(token.getCreatedAt())) {
            throw new BusinessException(MemberErrorCode.INVALID_REFRESH_TOKEN);
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
            throw new BusinessException(MemberErrorCode.INVALID_CREDENTIALS);
        }
        // 같은 비밀번호로의 "변경"은 거부한다 (2026-08-10 확정) — 유출 대응이 목적인 기능인데
        // 같은 값이면 아무것도 바뀌지 않으면서 다른 기기만 로그아웃되는 어리둥절한 결과가 된다
        if (matchesSafely(request.newPassword(), member.getPassword())) {
            throw new BusinessException(MemberErrorCode.PASSWORD_UNCHANGED);
        }
        member.changePassword(passwordEncoder.encode(request.newPassword()));
        // **flush를 여기서 명시한다** (리뷰 백로그 97번). 이 UPDATE가 실제로 나가는 것은 지금까지
        // 뒤이은 일괄 폐기(revokeAllByMemberId)의 `flushAutomatically = true`에 얹혀 있었다 —
        // 누군가 그 옵션을 떼면 **비밀번호 변경만 조용히 유실되고 토큰은 폐기되는** 상태가 된다.
        // 순서가 뒤집혀도 안 된다: 폐기가 먼저면 방금 발급한 토큰까지 쓸려 나간다 (RefreshTokenService 주석)
        memberRepository.saveAndFlush(member);
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
        // 활성 검사를 **배타 잠금 조회로** 한다 (리뷰 백로그 109번) — 회원 행을 고치려는 게 아니라
        // 재발급의 공유 잠금(findByIdForShare)과 충돌시켜 둘을 직렬화하는 것이 목적이다.
        // 잠금이 없으면 재발급이 INSERT한(아직 미커밋) 새 토큰을 아래 일괄 UPDATE가 못 보고 지나가,
        // 200으로 끊었다고 응답한 기기가 그대로 살아남는다. 활성 조건이 쿼리에 있어 조회 추가는 없다
        memberRepository.findActiveByIdForUpdate(memberId)
                .orElseThrow(() -> new BusinessException(MemberErrorCode.NOT_FOUND));
        UUID sessionId;
        try {
            sessionId = UUID.fromString(rawSessionId);
        } catch (IllegalArgumentException e) {
            // 형식 오류도 404 — 존재 여부 비노출(5절 규칙)과 일치하고, 경로 타입 오류가 500이 되는
            // 계열(백로그 13번)을 새로 만들지 않기 위해 UUID 파싱을 여기서 흡수한다
            throw new BusinessException(MemberErrorCode.SESSION_NOT_FOUND);
        }
        if (sessionId.equals(refreshTokenService.findSessionIdOf(rawRefreshToken))) {
            throw new BusinessException(MemberErrorCode.SESSION_CURRENT);
        }
        // memberId 조건이 쿼리에 있어 남의 세션은 0행 → 404 (존재 여부가 새지 않는다)
        if (refreshTokenService.revokeSession(memberId, sessionId) == 0) {
            throw new BusinessException(MemberErrorCode.SESSION_NOT_FOUND);
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
            throw new BusinessException(MemberErrorCode.WITHDRAW_CHAT_OWNER);
        }
        // 엔티티 변경은 반드시 벌크 UPDATE들보다 **먼저** — 아래 벌크의 clearAutomatically가
        // 영속성 컨텍스트를 비워 member가 detach되면, 그 뒤의 변경은 커밋에 반영되지 않고 유실된다
        // (백로그 99번이 경고한 전염 사례 — 검증에서 실제로 소프트 삭제가 유실돼 순서를 못 박음).
        // 이 변경 자체는 벌크의 flushAutomatically가 UPDATE로 함께 내보낸다
        member.withdraw(); // deleted_at + tokens_valid_from (Member.withdraw 주석 참조)
        chatRoomMemberRepository.leaveAllByMemberId(memberId, Instant.now(), ChatLeftReason.LEFT);
        refreshTokenService.revokeAllOnWithdraw(memberId);
        // 이미 맺어진 WebSocket 구독은 위 정리로 끊기지 않는다 — 참여자 검증이 SUBSCRIBE 시점에만 돌기 때문에
        // 참여 행을 지워도 기존 구독은 계속 수신한다. 커밋 후 연결 자체를 끊는다 (백로그 110번).
        // 롤백된 탈퇴로 멀쩡한 연결을 끊지 않도록 수신부가 AFTER_COMMIT이다
        eventPublisher.publishEvent(new MemberWithdrawnEvent(memberId));
    }

    /**
     * 탈퇴 본인 확인 — LOCAL은 현재 비밀번호, 소셜은 확인 문구 (2026-08-11 확정).
     * 소셜 계정에는 password가 없어(NULL) 비밀번호 재입력이라는 확인 수단 자체가 성립하지 않는다.
     */
    private void verifyWithdrawIdentity(Member member, WithdrawRequest request) {
        if (member.getProvider() == Provider.LOCAL) {
            if (member.getPassword() == null
                    || !matchesSafely(request.password(), member.getPassword())) {
                throw new BusinessException(MemberErrorCode.INVALID_CREDENTIALS);
            }
            return;
        }
        if (!WITHDRAW_CONFIRM_PHRASE.equals(request.confirmPhrase())) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
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
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }
        // 확장자 없는 고정 경로 + 덮어쓰기 — 고아 파일 방지 (ImageStorageClient 주석)
        String url = imageStorageClient.upload("member-" + memberId, bytes, file.getContentType());

        Member member = memberProfileImageUpdater.apply(
                memberId, url + "?v=" + Instant.now().toEpochMilli());
        return MemberResponse.from(member);
    }

    /**
     * 이메일 정규화 — 저장·조회의 단일 규칙 (리뷰 백로그 2번).
     *
     * <p>정규화 전에는 앱 검사와 DB UNIQUE 인덱스가 모두 대소문자를 구분해
     * {@code Test@a.com}과 {@code test@a.com}이 **별개 계정**으로 가입됐고,
     * 로그인도 가입 때 쓴 대소문자와 정확히 같아야 성공했다.
     * "이메일 1개 = 활성 계정 1개"(erd.md)라는 전제를 지키려면 한 곳에서만 규칙을 정해야 한다.
     *
     * <p>{@code Locale.ROOT}를 쓰는 이유: 기본 로케일 기반 {@code toLowerCase()}는 터키어 환경에서
     * {@code I}를 {@code ı}(점 없는 i)로 바꿔, 서버 로케일에 따라 같은 이메일이 다른 값이 된다.
     *
     * <p>도메인만 소문자로 바꾸는 방식(로컬파트는 RFC상 대소문자 구분)은 택하지 않았다 —
     * 실제 메일 서비스가 로컬파트를 구분하지 않고, 사용자가 겪는 문제는 "대문자로 쳤더니 로그인 실패"다.
     *
     * @return 소문자로 정규화한 이메일. 입력이 null이거나 공백뿐이면 null (카카오 이메일 미제공 경로)
     */
    private String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * 이름(닉네임) 중복 검사용 정규화. 저장값은 원문이고 <b>비교할 때만</b> 이 형태를 쓴다
     * (이메일과 달리 이름은 대소문자를 보존해 보여줘야 한다).
     *
     * <p>{@code Locale.ROOT} 이유는 normalizeEmail과 같다. 이 값은
     * {@code MemberRepository.existsActiveByNormalizedName}의 파라미터 규약이자
     * {@code lower(name)} 부분 UNIQUE 인덱스와 짝이다 — 셋이 같은 규칙이어야 검사와 최종 차단이 일치한다.
     *
     * @param name 이미 trim된 이름
     */
    private String normalizeName(String name) {
        return name.toLowerCase(Locale.ROOT);
    }

    // 활성 조건이 쿼리에 있는 조회로 통일 (백로그 95번 해소 — 이전에는 findById().filter 복붙이 4곳)
    private Member findActiveMemberOrThrow(Long memberId) {
        return memberRepository.findByIdAndDeletedAtIsNull(memberId)
                .orElseThrow(() -> new BusinessException(MemberErrorCode.NOT_FOUND));
    }

    // 이름 수정 (docs/api-spec.md 1절). 검증 규칙·trim 시점 모두 가입과 동일 (DTO에서 처리 — 백로그 96번)
    @Transactional
    public MemberResponse updateName(Long memberId, NameUpdateRequest request) {
        Member member = findActiveMemberOrThrow(memberId);
        String name = request.name();
        // 자기 이름은 검사에서 뺀다 — 안 그러면 아무것도 안 바꾸고 저장만 눌러도 "중복"으로 거부된다.
        // 대소문자만 바꾸는 것도 자기 행이라 허용된다(부분 UNIQUE는 lower(name) 기준이므로 충돌하지 않는다)
        if (!name.equalsIgnoreCase(member.getName())
                && memberRepository.existsActiveByNormalizedName(normalizeName(name))) {
            throw new BusinessException(MemberErrorCode.NAME_DUPLICATED);
        }
        // 여기서 지는 경쟁(검사 통과 후 남이 먼저 그 이름을 차지)은 커밋 시점의 UNIQUE 위반이 된다.
        // 변경 감지로 나가는 UPDATE라 이 메서드 안에서 잡을 자리가 없고,
        // GlobalExceptionHandler의 DataIntegrityViolationException 백스톱이 409로 응답한다
        member.changeName(name);
        return MemberResponse.from(member);
    }

    // 토큰은 유효하지만 그 사이 탈퇴한 계정일 수 있으므로 활성 여부까지 확인한다
    @Transactional(readOnly = true)
    public MemberResponse getMyInfo(Long memberId) {
        Member member = findActiveMemberOrThrow(memberId);
        return MemberResponse.from(member);
    }
}
