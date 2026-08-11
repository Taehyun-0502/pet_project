package com.pet.backend.member;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.dto.LoginRequest;
import com.pet.backend.member.dto.LoginResponse;
import com.pet.backend.member.dto.MemberResponse;
import com.pet.backend.member.dto.PasswordChangeRequest;
import com.pet.backend.member.dto.SignupRequest;
import com.pet.backend.member.dto.TokenResponse;
import com.pet.backend.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenService refreshTokenService;

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
    public LoginResult login(LoginRequest request) {
        Member member = memberRepository.findByEmailAndDeletedAtIsNull(request.email())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS));
        // password가 NULL인 소셜 계정은 자체 로그인 불가
        if (member.getPassword() == null || !matchesSafely(request.password(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        // 로그인마다 새 리프레시 토큰을 발급한다 — 기기별로 따로 살아 있고, 로그아웃도 그 기기만 끊긴다
        String refreshToken = refreshTokenService.issue(member.getId());
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
        RefreshTokenService.Rotated rotated = refreshTokenService.rotate(rawRefreshToken);
        // 발급 후 회원을 다시 읽는다 — 그 사이 탈퇴했거나 role이 바뀌었을 수 있다.
        // 여기서 실패하면 같은 트랜잭션이라 회전도 함께 롤백되므로 토큰이 어중간하게 남지 않는다
        Member member = memberRepository.findById(rotated.memberId())
                .filter(m -> !m.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN));

        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        return new RefreshResult(
                TokenResponse.of(accessToken, jwtTokenProvider.expirationSeconds()),
                rotated.rawToken());
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
    public String changePassword(Long memberId, PasswordChangeRequest request) {
        Member member = memberRepository.findById(memberId)
                .filter(m -> !m.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (member.getPassword() == null
                || !matchesSafely(request.currentPassword(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        member.changePassword(passwordEncoder.encode(request.newPassword()));
        return refreshTokenService.reissueAfterPasswordChange(memberId);
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

    // 토큰은 유효하지만 그 사이 탈퇴한 계정일 수 있으므로 활성 여부까지 확인한다
    @Transactional(readOnly = true)
    public MemberResponse getMyInfo(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .filter(m -> !m.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return MemberResponse.from(member);
    }
}
