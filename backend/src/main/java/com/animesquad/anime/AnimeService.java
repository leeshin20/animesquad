package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnimeService {

    private final AnimeRepository animes;
    private final AniListClient aniList;
    private final ExcludedAnimeRepository excluded;

    public AnimeService(AnimeRepository animes, AniListClient aniList, ExcludedAnimeRepository excluded) {
        this.animes = animes;
        this.aniList = aniList;
        this.excluded = excluded;
    }

    @Transactional
    public Anime upsertFromAniList(AniListMedia m) {
        excluded.lockCatalog();
        requireNotExcluded(m.anilistId());
        return animes.findByAnilistId(m.anilistId())
            .map(existing -> {
                existing.refreshFrom(m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                    m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear(), m.season(),
                    m.startDate());
                return existing;
            })
            .orElseGet(() -> animes.save(new Anime(
                m.anilistId(), m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear(), m.season(),
                m.startDate())));
    }

    @Transactional
    public int bulkCacheSeason(int year, String season) {
        var media = aniList.fetchSeason(year, season);
        excluded.lockCatalog();
        return (int) media.stream()
            .filter(m -> m.titleRomaji() != null && m.titleNative() != null
                && m.status() != null && m.format() != null)
            .filter(m -> !excluded.existsByAnilistId(m.anilistId()))
            .map(this::upsertFromAniList)
            .count();
    }

    @Transactional
    public Anime findOrFetchByAnilistId(int anilistId) {
        excluded.lockCatalog();
        requireNotExcluded(anilistId);
        return animes.findByAnilistId(anilistId).orElseGet(() -> {
            AniListMedia m = aniList.fetchById(anilistId);
            if (m == null) {
                throw new IllegalArgumentException("anime not found on AniList: " + anilistId);
            }
            return upsertFromAniList(m);
        });
    }

    private void requireNotExcluded(int anilistId) {
        if (excluded.existsByAnilistId(anilistId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "관리자가 제외한 작품이에요");
        }
    }
}
