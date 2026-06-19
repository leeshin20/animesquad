package com.animesquad;

import com.animesquad.admin.AdminProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AdminProperties.class)
public class AnimesquadApplication {
    public static void main(String[] args) {
        SpringApplication.run(AnimesquadApplication.class, args);
    }
}
