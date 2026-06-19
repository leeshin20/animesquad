package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/anime")
public class AnimeController {

    private final AnimeSearchService searchService;

    public AnimeController(AnimeSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping("/search")
    public List<AnimeResponse> search(@RequestParam("q") String q) {
        return searchService.search(q).stream().map(AnimeResponse::from).toList();
    }
}
