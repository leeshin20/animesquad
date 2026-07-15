package com.animesquad.activity;

import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class MyProgressActivityService {

    private static final int MAX_LOGICAL = 500;
    private static final int MAX_ROWS = 1500;
    private static final Duration COPY_WINDOW = Duration.ofSeconds(1);

    public record ProgressActivity(
        Long id, Long animeId, int progress, OffsetDateTime createdAt
    ) {}

    private final ActivityRepository activities;
    private final WatchEntryRepository watches;

    public MyProgressActivityService(
        ActivityRepository activities, WatchEntryRepository watches
    ) {
        this.activities = activities;
        this.watches = watches;
    }

    @Transactional(readOnly = true)
    public List<ProgressActivity> listMine(Long userId, int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, MAX_LOGICAL));
        List<ProgressActivity> logical = new ArrayList<>();
        for (Activity row : activities.findByActorIdAndTypeOrderByCreatedAtDesc(
                userId, ActivityType.PROGRESS_UPDATED, Limit.of(MAX_ROWS))) {
            Integer progress = progressOf(row);
            if (row.getAnimeId() == null || progress == null) continue;
            int duplicateIndex = duplicateIndex(logical, row, progress);
            if (duplicateIndex < 0) {
                logical.add(new ProgressActivity(
                    row.getId(), row.getAnimeId(), progress, row.getCreatedAt()));
            } else {
                ProgressActivity prior = logical.get(duplicateIndex);
                logical.set(duplicateIndex, new ProgressActivity(
                    Math.min(prior.id(), row.getId()), prior.animeId(), prior.progress(),
                    prior.createdAt().isAfter(row.getCreatedAt())
                        ? prior.createdAt() : row.getCreatedAt()));
            }
        }
        return logical.stream()
            .sorted(Comparator.comparing(ProgressActivity::createdAt).reversed())
            .limit(limit)
            .toList();
    }

    @Transactional
    public void deleteMine(Long userId, Long activityId) {
        Activity target = activities.findById(activityId)
            .filter(a -> a.getActorId().equals(userId))
            .filter(a -> a.getType() == ActivityType.PROGRESS_UPDATED)
            .orElseThrow(MyProgressActivityService::notFound);
        Integer progress = progressOf(target);
        if (target.getAnimeId() == null || progress == null) throw notFound();

        WatchEntry watch = watches.findByUserIdAndAnimeId(userId, target.getAnimeId())
            .orElseThrow(MyProgressActivityService::notFound);
        List<Activity> copies = activities
            .findAllByActorIdAndAnimeIdAndType(
                userId, target.getAnimeId(), ActivityType.PROGRESS_UPDATED)
            .stream()
            .filter(a -> progress.equals(progressOf(a)))
            .filter(a -> withinWindow(a.getCreatedAt(), target.getCreatedAt()))
            .toList();

        activities.deleteAll(copies);
        watch.apply(null, Math.max(0, progress - 1), null, null);
    }

    private static int duplicateIndex(
        List<ProgressActivity> logical, Activity row, int progress
    ) {
        for (int i = 0; i < logical.size(); i++) {
            ProgressActivity item = logical.get(i);
            if (item.animeId().equals(row.getAnimeId()) && item.progress() == progress &&
                withinWindow(item.createdAt(), row.getCreatedAt())) return i;
        }
        return -1;
    }

    private static boolean withinWindow(OffsetDateTime a, OffsetDateTime b) {
        return Duration.between(a, b).abs().compareTo(COPY_WINDOW) <= 0;
    }

    private static Integer progressOf(Activity activity) {
        Object value = activity.getPayload().get("progress");
        return value instanceof Number number ? number.intValue() : null;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "진도 기록이 없어요");
    }
}
