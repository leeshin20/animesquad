package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/anime")
public class AnimePlatformLinkController {
    public record RegisterLinkRequest(String platform, String platformAnimeId) {}

    private final AnimePlatformLinkService links;

    public AnimePlatformLinkController(AnimePlatformLinkService links) {
        this.links = links;
    }

    @GetMapping("/platform-links/{platform}/{platformAnimeId}")
    public AnimeResponse resolve(@PathVariable String platform, @PathVariable String platformAnimeId) {
        return AnimeResponse.from(links.resolve(platform, platformAnimeId));
    }

    @PostMapping("/{animeId}/platform-links")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void register(@PathVariable Long animeId, @RequestBody RegisterLinkRequest body) {
        links.register(animeId, body.platform(), body.platformAnimeId());
    }
}
