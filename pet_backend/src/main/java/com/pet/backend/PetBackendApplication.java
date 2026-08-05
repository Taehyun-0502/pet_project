package com.pet.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// ConfigurationPropertiesScan: JwtProperties 같은 @ConfigurationProperties record를 빈으로 등록
@SpringBootApplication
@ConfigurationPropertiesScan
public class PetBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(PetBackendApplication.class, args);
	}

}
