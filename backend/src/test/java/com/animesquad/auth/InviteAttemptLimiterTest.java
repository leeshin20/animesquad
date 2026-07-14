package com.animesquad.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class InviteAttemptLimiterTest {

    @Test
    void laterFailureRemovesExpiredEntriesForOtherIps() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-15T00:00:00Z"));
        InviteAttemptLimiter limiter = new InviteAttemptLimiter(clock);
        limiter.recordFailure("expired-ip");

        clock.advance(Duration.ofMinutes(10));
        for (int activity = 0; activity < 64; activity++) {
            limiter.recordFailure("active-ip");
        }

        ConcurrentHashMap<?, ?> attempts =
            (ConcurrentHashMap<?, ?>) ReflectionTestUtils.getField(limiter, "attempts");
        assertThat(attempts).hasSize(1);
        assertThat(attempts.containsKey("active-ip")).isTrue();
    }

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

    @Test
    void onlyFifthConcurrentFailureIsAllowedAndLaterFailuresAreBlocked() throws Exception {
        InviteAttemptLimiter limiter = new InviteAttemptLimiter(Clock.systemUTC());
        for (int i = 0; i < 4; i++) {
            limiter.recordFailure("same-ip");
        }
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(workers);
        AtomicInteger allowed = new AtomicInteger();
        AtomicInteger blocked = new AtomicInteger();

        try {
            for (int i = 0; i < workers; i++) {
                executor.execute(() -> {
                    ready.countDown();
                    try {
                        start.await();
                        if (limiter.recordFailureAndIsBlocked("same-ip")) {
                            blocked.incrementAndGet();
                        } else {
                            allowed.incrementAndGet();
                        }
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

        assertThat(allowed).hasValue(1);
        assertThat(blocked).hasValue(workers - 1);
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
