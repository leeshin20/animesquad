package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchService {

    private final WatchEntryRepository entries;
    private final AnimeService animeService;

    public WatchService(WatchEntryRepository entries, AnimeService animeService) {
        this.entries = entries;
        this.animeService = animeService;
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
        e.apply(status, progress, score, comment);
        return e;
    }

    @Transactional(readOnly = true)
    public List<WatchEntry> listMine(Long userId) {
        return entries.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }
}
