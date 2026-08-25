package com.pet.backend.member.dto;

import com.pet.backend.common.MaxBytes;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 회원가입 요청 (docs/api-spec.md 1절).
 * role·provider는 받지 않는다 — 서버가 MEMBER/LOCAL로 고정.
 */
public record SignupRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.")
        String email,

        // BCrypt는 입력을 72바이트까지만 받는다. @Size는 글자 수 기준이라
        // 한글(글자당 3바이트) 25자면 통과한 뒤 encode()에서 터진다 — 바이트 상한을 따로 건다
        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, max = 60, message = "비밀번호는 8자 이상 60자 이하여야 합니다.")
        @MaxBytes(value = 72, message = "비밀번호가 너무 깁니다. (UTF-8 기준 72바이트 이하, 한글은 24자까지)")
        String password,

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {

    /**
     * 이름의 앞뒤 공백을 **검증 전에** 떼어낸다 (리뷰 백로그 96번).
     *
     * <p>명세는 "trim 후 1~50자"인데 {@code @Size}는 원문 길이를 보므로,
     * 그냥 두면 <b>"50자 + 후행 공백"이 400으로 거부된다</b> — 정작 저장될 값은 50자라 통과해야 맞다.
     * 반대로 공백만 입력한 경우는 여기서 빈 문자열이 되어 {@code @NotBlank}가 잡는다.
     *
     * <p>compact constructor에 두는 이유: 검증은 필드에 들어간 값 기준으로 돌기 때문에,
     * 여기서 다듬으면 <b>검증과 저장이 같은 값을 본다</b>. 서비스에서 trim하면 이미 검증이 끝난 뒤라 늦다.
     *
     * <p><b>비밀번호는 절대 trim하지 않는다</b> — 앞뒤 공백도 사용자가 정한 문자이고,
     * 여기서 다듬으면 기존 회원이 로그인하지 못한다.
     */
    public SignupRequest {
        name = name == null ? null : name.trim();
    }
}
