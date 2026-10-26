package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.watch.dto.AddWatchRequest;
import com.animesquad.watch.dto.UpdateWatchRequest;
import com.animesquad.watch.dto.WatchEntryResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
        List<WatchEntry> entries = watchService.listMine(me.userId());
        Map<Long, Anime> animeMap = animes.findAllById(
                entries.stream().map(WatchEntry::getAnimeId).toList()
            ).stream()
            .collect(Collectors.toMap(Anime::getId, a -> a));
        return entries.stream()
            .map(e -> WatchEntryResponse.from(e, animeMap.get(e.getAnimeId())))
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

    public record AdvanceProgressRequest(@NotNull @Positive Integer progress) {}

    @PostMapping("/{animeId}/progress")
    public WatchEntryResponse advanceProgress(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @Valid @RequestBody AdvanceProgressRequest req
    ) {
        Anime anime = animes.findById(animeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        WatchEntry entry = watchService.advanceProgress(me.userId(), animeId, req.progress());
        return WatchEntryResponse.from(entry, anime);
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
