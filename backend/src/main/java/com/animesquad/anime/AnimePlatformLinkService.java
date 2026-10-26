package com.animesquad.anime;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnimePlatformLinkService {
    private final AnimePlatformLinkRepository links;
    private final AnimeRepository animes;

    public AnimePlatformLinkService(AnimePlatformLinkRepository links, AnimeRepository animes) {
        this.links = links;
        this.animes = animes;
    }

    @Transactional(readOnly = true)
    public Anime resolve(String platform, String platformAnimeId) {
        validate(platform, platformAnimeId);
        return links.findByPlatformAndPlatformAnimeId(platform, platformAnimeId)
            .flatMap(link -> animes.findById(link.getAnimeId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "platform link not found"));
    }

    @Transactional
    public void register(Long animeId, String platform, String platformAnimeId) {
        validate(platform, platformAnimeId);
        animes.findByIdForUpdate(animeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        links.insertIfAbsent(platform, platformAnimeId, animeId);
        AnimePlatformLink link = links.findByPlatformAndPlatformAnimeId(platform, platformAnimeId).orElseThrow();
        if (!link.getAnimeId().equals(animeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 다른 작품에 연결된 라프텔 작품이에요");
        }
    }

    private static void validate(String platform, String platformAnimeId) {
        if (!"LAFTEL".equals(platform) || platformAnimeId == null
            || !platformAnimeId.matches("[1-9][0-9]{0,19}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid platform or platform anime ID");
        }
    }
}
