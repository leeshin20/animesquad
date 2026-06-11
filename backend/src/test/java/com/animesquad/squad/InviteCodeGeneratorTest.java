package com.animesquad.squad;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class InviteCodeGeneratorTest {

    private final InviteCodeGenerator gen = new InviteCodeGenerator();

    @Test
    void next_returns10CharsFromAlphabet() {
        for (int i = 0; i < 1000; i++) {
            String code = gen.next();
            assertThat(code).hasSize(10);
            assertThat(code).matches("[A-HJ-NP-Z2-9]+");
        }
    }

    @Test
    void next_producesDifferentValues() {
        String a = gen.next();
        String b = gen.next();
        assertThat(a).isNotEqualTo(b);
    }
}
