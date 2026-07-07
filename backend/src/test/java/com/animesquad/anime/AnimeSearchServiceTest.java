package com.animesquad.anime;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnimeSearchServiceTest {

    private final AnimeRepository animes = mock(AnimeRepository.class);
    private final AnimeSearchService service = new AnimeSearchService(animes);

    @Test
    void search_delegatesToRepository_withLowercasedLikePattern() {
        Anime hit = new Anime(1, "Frieren", "葬送", "F", "img", 12, "FINISHED", "TV", 2024, null, null);
        when(animes.searchByTitle(eq("%frieren%"), eq("%Frieren%"), eq("%frieren%"), eq("%Frieren%")))
            .thenReturn(List.of(hit));

        List<Anime> result = service.search("Frieren");

        assertThat(result).containsExactly(hit);
    }

    @Test
    void search_throws_whenQueryBlank() {
        assertThatThrownBy(() -> service.search(" "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
