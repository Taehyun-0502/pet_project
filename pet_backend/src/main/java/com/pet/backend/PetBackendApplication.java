package com.pet.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

// ConfigurationPropertiesScan: JwtProperties 같은 @ConfigurationProperties record를 빈으로 등록
// EnableScheduling: 만료 리프레시 토큰 정리 배치 (member/RefreshTokenCleanup)
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class PetBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(PetBackendApplication.class, args);
	}

}
