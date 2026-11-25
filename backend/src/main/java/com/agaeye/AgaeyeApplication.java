package com.agaeye;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AgaeyeApplication {
    public static void main(String[] args) { SpringApplication.run(AgaeyeApplication.class, args); }
}
