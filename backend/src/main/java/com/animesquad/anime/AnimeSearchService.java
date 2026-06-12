package com.animesquad.anime;

import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class AnimeSearchService {

    private final AniListClient client;

    public AnimeSearchService(AniListClient client) {
        this.client = client;
    }

    public List<AniListMedia> search(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("query is required");
        }
        return client.search(query.trim());
    }
}
