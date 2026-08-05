package com.pet.backend.member;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
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
}
