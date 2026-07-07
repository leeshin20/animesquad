package com.animesquad.anime;

import java.time.LocalDate;

public record AniListMedia(
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear,
    String season,
    LocalDate startDate
) {}
