package com.animesquad.squad;

import org.springframework.stereotype.Component;
import java.security.SecureRandom;

@Component
public class InviteCodeGenerator {

    // 32 chars — omits 0,O,1,I to avoid lookalikes
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 10;
    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
