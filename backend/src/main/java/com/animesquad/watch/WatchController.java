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
import org.springframework.web.server.ResponseStatusException;

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
        WatchEntry e;
        if (req.animeId() != null) {
            Anime a = animes.findById(req.animeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
            e = watchService.addToListById(me.userId(), a.getId(), req.status());
        } else if (req.anilistId() != null) {
            e = watchService.addToList(me.userId(), req.anilistId(), req.status());
        } else {
            throw new IllegalArgumentException("animeId 또는 anilistId 중 하나는 필요해요");
        }
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return ResponseEntity.status(HttpStatus.CREATED).body(WatchEntryResponse.from(e, a));
    }

    @GetMapping
    public List<WatchEntryResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return watchService.listMine(me.userId()).stream()
            .map(e -> WatchEntryResponse.from(e, animes.findById(e.getAnimeId()).orElseThrow()))
            .toList();
    }

    @GetMapping("/{animeId}")
    public WatchEntryResponse getMine(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        WatchEntry e = watchService.findEntry(me.userId(), animeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "not in list"));
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return WatchEntryResponse.from(e, a);
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

    @DeleteMapping("/{animeId}")
    public ResponseEntity<Void> remove(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        watchService.removeFromList(me.userId(), animeId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{animeId}/review")
    public ResponseEntity<Void> clearReview(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        watchService.clearReview(me.userId(), animeId);
        return ResponseEntity.noContent().build();
    }
}
