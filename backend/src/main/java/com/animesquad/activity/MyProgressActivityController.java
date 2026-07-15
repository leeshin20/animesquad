package com.animesquad.activity;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/me/progress-activities")
public class MyProgressActivityController {

    public record Item(
        Long id, AnimeRef anime, int progress, OffsetDateTime createdAt
    ) {}

    private final MyProgressActivityService service;
    private final AnimeRepository animes;

    public MyProgressActivityController(
        MyProgressActivityService service, AnimeRepository animes
    ) {
        this.service = service;
        this.animes = animes;
    }

    @GetMapping
    public List<Item> list(
        @AuthenticationPrincipal CurrentUser me,
        @RequestParam(defaultValue = "500") int limit
    ) {
        List<MyProgressActivityService.ProgressActivity> rows =
            service.listMine(me.userId(), limit);
        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(MyProgressActivityService.ProgressActivity::animeId).toList()
        ).stream().collect(Collectors.toMap(Anime::getId, anime -> anime));
        return rows.stream()
            .filter(row -> animeById.containsKey(row.animeId()))
            .map(row -> new Item(
                row.id(), AnimeRef.from(animeById.get(row.animeId())),
                row.progress(), row.createdAt()))
            .toList();
    }

    @DeleteMapping("/{activityId}")
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long activityId
    ) {
        service.deleteMine(me.userId(), activityId);
        return ResponseEntity.noContent().build();
    }
}
