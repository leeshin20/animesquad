package com.animesquad.anime;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class AnimeServiceIT extends AbstractIntegrationTest {

    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;

    private AniListMedia media(int id, String romaji) {
        return new AniListMedia(id, romaji, "ネイティブ", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    @Test
    void upsert_inserts_whenNewAnilistId() {
        Anime saved = animeService.upsertFromAniList(media(101, "Frieren"));

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getAnilistId()).isEqualTo(101);
        assertThat(saved.getTitleRomaji()).isEqualTo("Frieren");
        assertThat(animes.findByAnilistId(101)).isPresent();
    }

    @Test
    void upsert_refreshes_whenExisting() {
        animeService.upsertFromAniList(media(202, "Old"));
        Anime updated = animeService.upsertFromAniList(media(202, "New"));

        assertThat(updated.getTitleRomaji()).isEqualTo("New");
        assertThat(animes.count()).isEqualTo(1);
    }
}
