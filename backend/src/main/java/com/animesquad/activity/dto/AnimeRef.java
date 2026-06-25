package com.animesquad.activity.dto;

import com.animesquad.anime.Anime;

public record AnimeRef(Long id, String titleRomaji, String titleKorean, String coverImageUrl) {
    public static AnimeRef from(Anime a) {
        return new AnimeRef(a.getId(), a.getTitleRomaji(), a.getTitleKorean(), a.getCoverImageUrl());
    }
}
