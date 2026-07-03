package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/anime")
public class AnimeController {

    private final AnimeSearchService searchService;
    private final AnimeRepository animes;

    public AnimeController(AnimeSearchService searchService, AnimeRepository animes) {
        this.searchService = searchService;
        this.animes = animes;
    }

    private static final java.util.Set<String> VALID_SEASONS =
        java.util.Set.of("WINTER", "SPRING", "SUMMER", "FALL");

    @GetMapping("/browse")
    public List<AnimeResponse> browse(
            @RequestParam int year,
            @RequestParam String season) {
        if (!VALID_SEASONS.contains(season)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid season: " + season);
        }
        return animes.findBySeasonYearAndSeasonOrderByTitleRomajiAsc(year, season)
            .stream().map(AnimeResponse::from).toList();
    }

    @GetMapping("/search")
    public List<AnimeResponse> search(@RequestParam("q") String q) {
        return searchService.search(q).stream().map(AnimeResponse::from).toList();
    }

    @GetMapping("/{id}")
    public AnimeResponse getById(@PathVariable Long id) {
        return animes.findById(id).map(AnimeResponse::from)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
    }
}
