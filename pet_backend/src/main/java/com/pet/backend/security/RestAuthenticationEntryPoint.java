package com.pet.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.common.ApiResponse;
import com.pet.backend.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * 미인증 요청에 대한 응답. Security 필터는 GlobalExceptionHandler 바깥에서 동작하므로
 * ApiResponse 포맷을 직접 직렬화한다 (docs/conventions.md 4절).
 * 기본값(403) 대신 명세(docs/api-spec.md 5절)의 401 AUTH_TOKEN_INVALID로 응답.
 */
@Component
@RequiredArgsConstructor
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        ErrorCode code = ErrorCode.AUTH_TOKEN_INVALID;
        response.setStatus(code.getStatus().value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                ApiResponse.fail(code.getCode(), code.getDefaultMessage())));
    }
}
