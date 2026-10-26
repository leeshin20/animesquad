package com.animesquad.watch;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/me/episode-watches")
public class EpisodeWatchController {
    public record Item(Long id, AnimeRef anime, int episodeNumber, OffsetDateTime recordedAt, String source) {}
    private final EpisodeWatchService service;
    private final AnimeRepository animes;
    public EpisodeWatchController(EpisodeWatchService service, AnimeRepository animes) {
        this.service = service; this.animes = animes;
    }
    @GetMapping
    public List<Item> list(@AuthenticationPrincipal CurrentUser me,
        @RequestParam(required = false) Long cursor, @RequestParam(defaultValue = "50") int limit) {
        var rows = service.listMine(me.userId(), cursor, limit);
        var byId = animes.findAllById(rows.stream().map(EpisodeWatch::getAnimeId).distinct().toList())
            .stream().collect(Collectors.toMap(a -> a.getId(), Function.identity()));
        return rows.stream().map(w -> new Item(w.getId(), AnimeRef.from(byId.get(w.getAnimeId())),
            w.getEpisodeNumber(), w.getRecordedAt(), w.getSource())).toList();
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.deleteMine(me.userId(), id);
        return ResponseEntity.noContent().build();
    }
}
