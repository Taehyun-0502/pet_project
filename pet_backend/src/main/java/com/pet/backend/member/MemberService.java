package com.pet.backend.member;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
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
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        Member member = memberRepository.findByEmailAndDeletedAtIsNull(request.email())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS));
        // password가 NULL인 소셜 계정은 자체 로그인 불가
        if (member.getPassword() == null
                || !passwordEncoder.matches(request.password(), member.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        return LoginResponse.of(accessToken, jwtTokenProvider.expirationSeconds(), member);
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
