package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchService {

    private final WatchEntryRepository entries;
    private final AnimeService animeService;
    private final ApplicationEventPublisher events;

    public WatchService(WatchEntryRepository entries, AnimeService animeService,
                        ApplicationEventPublisher events) {
        this.entries = entries;
        this.animeService = animeService;
        this.events = events;
    }

    @Transactional
    public WatchEntry addToList(Long userId, int anilistId, WatchStatus status) {
        Anime anime = animeService.findOrFetchByAnilistId(anilistId);
        return entries.findByUserIdAndAnimeId(userId, anime.getId())
            .orElseGet(() -> entries.save(new WatchEntry(userId, anime.getId(), status)));
    }

    @Transactional
    public WatchEntry updateEntry(Long userId, Long animeId,
                                  WatchStatus status, Integer progress,
                                  Integer score, String comment) {
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));

        WatchStatus oldStatus = e.getStatus();
        int oldProgress = e.getProgress();
        Integer oldScore = e.getScore();

        e.apply(status, progress, score, comment);

        if (status != null && status != oldStatus) {
            events.publishEvent(new WatchStatusChangedEvent(userId, animeId, oldStatus, status));
        }
        if (progress != null && progress != oldProgress) {
            events.publishEvent(new ProgressUpdatedEvent(userId, animeId, progress));
        }
        if (score != null && !score.equals(oldScore)) {
            events.publishEvent(new WatchRatedEvent(userId, animeId, score));
        }
        return e;
    }

    @Transactional(readOnly = true)
    public List<WatchEntry> listMine(Long userId) {
        return entries.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }
}
