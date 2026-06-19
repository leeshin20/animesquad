package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnimeService {

    private final AnimeRepository animes;
    private final AniListClient aniList;

    public AnimeService(AnimeRepository animes, AniListClient aniList) {
        this.animes = animes;
        this.aniList = aniList;
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

    @Transactional
    public int bulkCacheSeason(int year, String season) {
        return (int) aniList.fetchSeason(year, season).stream()
            .filter(m -> m.titleRomaji() != null && m.titleNative() != null
                && m.status() != null && m.format() != null)
            .map(this::upsertFromAniList)
            .count();
    }

    @Transactional
    public Anime findOrFetchByAnilistId(int anilistId) {
        return animes.findByAnilistId(anilistId).orElseGet(() -> {
            AniListMedia m = aniList.fetchById(anilistId);
            if (m == null) {
                throw new IllegalArgumentException("anime not found on AniList: " + anilistId);
            }
            return upsertFromAniList(m);
        });
    }
}
