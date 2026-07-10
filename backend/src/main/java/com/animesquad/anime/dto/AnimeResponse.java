package com.animesquad.anime.dto;

import com.animesquad.anime.Anime;
import java.time.LocalDate;

public record AnimeResponse(
    Long id,
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String titleKorean,
    String searchKeywords,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear,
    String season,
    LocalDate startDate
) {
    public static AnimeResponse from(Anime a) {
        return new AnimeResponse(
            a.getId(), a.getAnilistId(),
            a.getTitleRomaji(), a.getTitleNative(), a.getTitleEnglish(), a.getTitleKorean(),
            a.getSearchKeywords(),
            a.getCoverImageUrl(), a.getEpisodes(),
            a.getStatus(), a.getFormat(), a.getSeasonYear(), a.getSeason(),
            a.getStartDate()
        );
    }
}
