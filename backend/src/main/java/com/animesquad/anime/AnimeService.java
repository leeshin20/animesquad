package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnimeService {

    private final AnimeRepository animes;

    public AnimeService(AnimeRepository animes) {
        this.animes = animes;
    }

    @Transactional
    public Anime upsertFromAniList(AniListMedia m) {
        return animes.findByAnilistId(m.anilistId())
            .map(existing -> {
                existing.refreshFrom(m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                    m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear());
                return existing;
            })
            .orElseGet(() -> animes.save(new Anime(
                m.anilistId(), m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear())));
    }
}
