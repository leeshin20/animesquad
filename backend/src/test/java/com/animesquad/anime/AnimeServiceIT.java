package com.animesquad.anime;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AnimeServiceIT extends AbstractIntegrationTest {

    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;
    @MockBean AniListClient aniList;

    private AniListMedia media(int id, String romaji) {
        return new AniListMedia(id, romaji, "ネイティブ", "Eng", "img", 12, "FINISHED", "TV", 2024, null, null);
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

    @Test
    void findOrFetch_returnsCached_withoutHittingAniList() {
        animeService.upsertFromAniList(media(303, "Cached"));

        Anime result = animeService.findOrFetchByAnilistId(303);

        assertThat(result.getTitleRomaji()).isEqualTo("Cached");
        verifyNoInteractions(aniList);
    }

    @Test
    void findOrFetch_fetchesAndUpserts_whenMissing() {
        when(aniList.fetchById(eq(404))).thenReturn(media(404, "Remote"));

        Anime result = animeService.findOrFetchByAnilistId(404);

        assertThat(result.getId()).isNotNull();
        assertThat(result.getTitleRomaji()).isEqualTo("Remote");
        assertThat(animes.findByAnilistId(404)).isPresent();
        verify(aniList).fetchById(404);
    }

    @Test
    void findOrFetch_throws_whenAniListReturnsNothing() {
        when(aniList.fetchById(eq(999))).thenReturn(null);

        assertThatThrownBy(() -> animeService.findOrFetchByAnilistId(999))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
