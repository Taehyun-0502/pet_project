package com.pet.backend.member;

import com.pet.backend.member.dto.LoginResponse;

/**
 * 로그인 처리 결과를 Controller로 옮기는 그릇.
 * 응답 바디(액세스 토큰·회원)와 쿠키로 나갈 리프레시 토큰 원문은 나가는 자리가 다를 뿐
 * 같은 한 번의 로그인에서 나오므로, Service가 둘 다 만들어 넘기고 Controller는 HTTP로 옮기기만 한다.
 */
record LoginResult(LoginResponse response, String refreshToken) {}
