package com.animesquad.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class InviteAttemptLimiter {

    private static final Duration WINDOW_DURATION = Duration.ofMinutes(10);
    private static final int FAILURE_LIMIT = 5;

    private final Clock clock;
    private final ConcurrentHashMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    public InviteAttemptLimiter() {
        this(Clock.systemUTC());
    }

    InviteAttemptLimiter(Clock clock) {
        this.clock = clock;
    }

    public boolean isBlocked(String clientIp) {
        Instant now = clock.instant();
        AttemptWindow window = attempts.computeIfPresent(clientIp,
                (ip, current) -> current.isExpiredAt(now) ? null : current);
        return window != null && window.failures() >= FAILURE_LIMIT;
    }

    public void recordFailure(String clientIp) {
        Instant now = clock.instant();
        attempts.compute(clientIp, (ip, current) -> {
            if (current == null || current.isExpiredAt(now)) {
                return new AttemptWindow(now, 1);
            }
            return new AttemptWindow(current.startedAt(), current.failures() + 1);
        });
    }

    public void clear(String clientIp) {
        attempts.remove(clientIp);
    }

    private record AttemptWindow(Instant startedAt, int failures) {

        boolean isExpiredAt(Instant instant) {
            return !instant.isBefore(startedAt.plus(WINDOW_DURATION));
        }
    }
}
