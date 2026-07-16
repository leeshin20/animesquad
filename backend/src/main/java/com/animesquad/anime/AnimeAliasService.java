package com.animesquad.anime;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Objects;
import java.util.stream.Stream;

@Service
public class AnimeAliasService {

    private static final int MAX_ALIAS_LENGTH = 200;

    private final AnimeRepository animes;

    public AnimeAliasService(AnimeRepository animes) {
        this.animes = animes;
    }

    @Transactional
    public void addAlias(Long animeId, String alias) {
        String trimmed = normalizeInput(alias);
        Anime anime = animes.findByIdForUpdate(animeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));

        String needle = normalizeForSearch(trimmed);
        boolean alreadySearchable = Stream.of(
                anime.getTitleRomaji(), anime.getTitleNative(), anime.getTitleEnglish(),
                anime.getTitleKorean(), anime.getSearchKeywords())
            .filter(Objects::nonNull)
            .map(AnimeAliasService::normalizeForSearch)
            .anyMatch(value -> value.contains(needle));
        if (alreadySearchable) return;

        String existing = anime.getSearchKeywords();
        anime.setSearchKeywords(existing == null || existing.isBlank()
            ? trimmed
            : existing.trim() + ", " + trimmed);
    }

    private static String normalizeInput(String alias) {
        if (alias == null || alias.isBlank()) {
            throw new IllegalArgumentException("alias is required");
        }
        String trimmed = alias.trim();
        if (trimmed.length() > MAX_ALIAS_LENGTH) {
            throw new IllegalArgumentException("alias must be 200 characters or fewer");
        }
        return trimmed;
    }

    private static String normalizeForSearch(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }
}
