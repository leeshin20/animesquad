package com.animesquad.anime;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnimeSearchServiceTest {

    private final AniListClient client = mock(AniListClient.class);
    private final AnimeSearchService service = new AnimeSearchService(client);

    @Test
    void search_delegatesToClient() {
        AniListMedia hit = new AniListMedia(1, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024);
        when(client.search(eq("frieren"))).thenReturn(List.of(hit));

        List<AniListMedia> result = service.search("frieren");

        assertThat(result).containsExactly(hit);
    }

    @Test
    void search_throws_whenQueryBlank() {
        assertThatThrownBy(() -> service.search(" "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
