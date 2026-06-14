package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.watch.dto.AddWatchRequest;
import com.animesquad.watch.dto.UpdateWatchRequest;
import com.animesquad.watch.dto.WatchEntryResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/watch")
public class WatchController {

    private final WatchService watchService;
    private final AnimeRepository animes;

    public WatchController(WatchService watchService, AnimeRepository animes) {
        this.watchService = watchService;
        this.animes = animes;
    }

    @PostMapping
    public ResponseEntity<WatchEntryResponse> add(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody AddWatchRequest req
    ) {
        WatchEntry e = watchService.addToList(me.userId(), req.anilistId(), req.status());
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return ResponseEntity.status(HttpStatus.CREATED).body(WatchEntryResponse.from(e, a));
    }

    @GetMapping
    public List<WatchEntryResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return watchService.listMine(me.userId()).stream()
            .map(e -> WatchEntryResponse.from(e, animes.findById(e.getAnimeId()).orElseThrow()))
            .toList();
    }

    @PatchMapping("/{animeId}")
    public WatchEntryResponse update(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @Valid @RequestBody UpdateWatchRequest req
    ) {
        WatchEntry e = watchService.updateEntry(
            me.userId(), animeId,
            req.status(), req.progress(), req.score(), req.comment());
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return WatchEntryResponse.from(e, a);
    }
}
