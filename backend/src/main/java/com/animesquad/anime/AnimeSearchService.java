package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Service
public class AnimeSearchService {

    private static final int LIMIT = 20;

    private final AnimeRepository animes;

    public AnimeSearchService(AnimeRepository animes) {
        this.animes = animes;
    }

    @Transactional(readOnly = true)
    public List<Anime> search(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("query is required");
        }
        String raw = query.trim();
        String stripped = raw.replace(" ", "");
        String like = "%" + raw.toLowerCase(Locale.ROOT) + "%";
        String rawLike = "%" + raw + "%";
        String likeStripped = "%" + stripped.toLowerCase(Locale.ROOT) + "%";
        String rawLikeStripped = "%" + stripped + "%";
        return animes.searchByTitle(like, rawLike, likeStripped, rawLikeStripped);
    }
}
