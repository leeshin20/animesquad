package com.animesquad.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class InviteAttemptLimiterTest {

    @Test
    void blocksSixthAttemptWithinTenMinutesAndResetsAfterWindow() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-15T00:00:00Z"));
        InviteAttemptLimiter limiter = new InviteAttemptLimiter(clock);

        for (int i = 0; i < 5; i++) {
            assertThat(limiter.isBlocked("203.0.113.1")).isFalse();
            limiter.recordFailure("203.0.113.1");
        }
        assertThat(limiter.isBlocked("203.0.113.1")).isTrue();

        clock.advance(Duration.ofMinutes(10));

        assertThat(limiter.isBlocked("203.0.113.1")).isFalse();
    }

    @Test
    void clearRemovesFailuresForOnlyThatIp() {
        InviteAttemptLimiter limiter = new InviteAttemptLimiter(Clock.systemUTC());
        for (int i = 0; i < 5; i++) {
            limiter.recordFailure("a");
        }
        for (int i = 0; i < 5; i++) {
            limiter.recordFailure("b");
        }

        limiter.clear("a");

        assertThat(limiter.isBlocked("a")).isFalse();
        assertThat(limiter.isBlocked("b")).isTrue();
    }

    @Test
    void recordsConcurrentFailuresAtomically() throws Exception {
        InviteAttemptLimiter limiter = new InviteAttemptLimiter(Clock.systemUTC());
        int workers = 5;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(workers);

        try {
            for (int i = 0; i < workers; i++) {
                executor.execute(() -> {
                    ready.countDown();
                    try {
                        start.await();
                        limiter.recordFailure("same-ip");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        assertThat(limiter.isBlocked("same-ip")).isTrue();
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
