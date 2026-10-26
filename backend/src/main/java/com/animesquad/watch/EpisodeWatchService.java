package com.animesquad.watch;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.watch.events.EpisodeWatchedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Set;

@Service
public class EpisodeWatchService {
    private final EpisodeWatchRepository history;
    private final WatchEntryRepository watches;
    private final EpisodeRatingRepository ratings;
    private final ActivityRepository activities;
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public EpisodeWatchService(EpisodeWatchRepository history, WatchEntryRepository watches,
        EpisodeRatingRepository ratings, ActivityRepository activities, JdbcTemplate jdbc,
        ApplicationEventPublisher events) {
        this.history = history; this.watches = watches; this.ratings = ratings;
        this.activities = activities; this.jdbc = jdbc; this.events = events;
    }

    public void lockUser(Long userId) {
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, userId);
    }

    @Transactional
    public WatchEntry record(Long userId, Long animeId, int episode, String source) {
        if (episode < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "회차는 1 이상이어야 해요");
        String actualSource = source == null ? "UNKNOWN" : source;
        if (!Set.of("EXTENSION", "MANUAL", "UNKNOWN").contains(actualSource)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid recording source");
        }
        lockUser(userId);
        watches.advanceProgress(userId, animeId, episode);
        if (history.insertOnce(userId, animeId, episode, actualSource) > 0) {
            EpisodeWatch row = history.findByUserIdAndAnimeIdAndEpisodeNumber(userId, animeId, episode).orElseThrow();
            events.publishEvent(new EpisodeWatchedEvent(userId, animeId, episode, row.getId()));
        }
        return watches.findByUserIdAndAnimeId(userId, animeId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<EpisodeWatch> listMine(Long userId, Long cursor, int limit) {
        Limit bounded = Limit.of(Math.max(1, Math.min(limit, 100)));
        return cursor == null ? history.findByUserIdOrderByIdDesc(userId, bounded)
            : history.findByUserIdAndIdLessThanOrderByIdDesc(userId, cursor, bounded);
    }

    @Transactional
    public void deleteMine(Long userId, Long id) {
        lockUser(userId);
        EpisodeWatch row = history.findById(id).filter(w -> w.getUserId().equals(userId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "시청 기록이 없어요"));
        if (ratings.findByUserIdAndAnimeIdAndEpisodeNumber(userId, row.getAnimeId(), row.getEpisodeNumber()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "해당 회차의 감상평을 먼저 삭제해주세요");
        }
        activities.deleteByEpisodeWatchId(userId, id);
        history.delete(row);
        watches.findByUserIdAndAnimeId(userId, row.getAnimeId()).ifPresent(watch -> {
            if (watch.getProgress() == row.getEpisodeNumber()) {
                watch.apply(null, Math.max(0, row.getEpisodeNumber() - 1), null, null);
            }
        });
    }
}
