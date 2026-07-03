package com.animesquad.anime.dto;

import com.animesquad.anime.Anime;

public record AnimeResponse(
    Long id,
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String titleKorean,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear,
    String season
) {
    public static AnimeResponse from(Anime a) {
        return new AnimeResponse(
            a.getId(), a.getAnilistId(),
            a.getTitleRomaji(), a.getTitleNative(), a.getTitleEnglish(), a.getTitleKorean(),
            a.getCoverImageUrl(), a.getEpisodes(),
            a.getStatus(), a.getFormat(), a.getSeasonYear(), a.getSeason()
        );
    }
}
