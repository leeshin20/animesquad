package com.animesquad.anime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnimeAliasServiceTest {

    @Mock AnimeRepository animes;
    AnimeAliasService service;

    @BeforeEach
    void setUp() {
        service = new AnimeAliasService(animes);
    }

    private Anime anime() {
        Anime anime = new Anime(
            1, "Tomb Raider King", "도굴왕", null,
            "img", 12, "FINISHED", "TV", 2026, null, null);
        anime.setTitleKorean("도굴왕");
        return anime;
    }

    @Test
    void addAlias_appendsTrimmedAliasWithoutOverwritingExistingKeywords() {
        Anime anime = anime();
        anime.setSearchKeywords("툼 레이더 킹");
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "  (자막) 도굴왕  ");

        assertThat(anime.getSearchKeywords()).isEqualTo("툼 레이더 킹, (자막) 도굴왕");
    }

    @Test
    void addAlias_setsFirstKeywordWhenSearchKeywordsAreBlank() {
        Anime anime = anime();
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "(자막) 도굴왕");

        assertThat(anime.getSearchKeywords()).isEqualTo("(자막) 도굴왕");
    }

    @Test
    void addAlias_isNoOpWhenAliasIsAlreadySearchableIgnoringCaseAndSpaces() {
        Anime anime = anime();
        anime.setSearchKeywords("툼 레이더 킹, (자막) 도굴왕");
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, " (자막)도굴왕 ");

        assertThat(anime.getSearchKeywords()).isEqualTo("툼 레이더 킹, (자막) 도굴왕");
    }

    @Test
    void addAlias_rejectsBlankAndOver200Characters() {
        assertThatThrownBy(() -> service.addAlias(1L, "   "))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("alias is required");
        assertThatThrownBy(() -> service.addAlias(1L, "x".repeat(201)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("alias must be 200 characters or fewer");
    }

    @Test
    void addAlias_appliesLengthLimitAfterTrimming() {
        Anime anime = anime();
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "  " + "x".repeat(200) + "  ");

        assertThat(anime.getSearchKeywords()).isEqualTo("x".repeat(200));
    }

    @Test
    void addAlias_returns404WhenAnimeDoesNotExist() {
        when(animes.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addAlias(99L, "별칭"))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> assertThat(
                ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(404));
    }
}
