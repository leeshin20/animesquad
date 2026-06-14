package com.animesquad.activity;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.activity.dto.FeedItemResponse;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/squads/{squadId}/feed")
public class FeedController {

    private final ActivityService activityService;
    private final UserRepository users;
    private final AnimeRepository animes;

    public FeedController(ActivityService activityService, UserRepository users, AnimeRepository animes) {
        this.activityService = activityService;
        this.users = users;
        this.animes = animes;
    }

    @GetMapping
    public List<FeedItemResponse> feed(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long squadId,
        @RequestParam(required = false) Long cursor,
        @RequestParam(defaultValue = "30") int limit
    ) {
        List<Activity> rows = activityService.listForSquad(me.userId(), squadId, cursor, limit);
        if (rows.isEmpty()) return List.of();

        Map<Long, User> actorById = users.findAllById(
                rows.stream().map(Activity::getActorId).distinct().toList()).stream()
            .collect(Collectors.toMap(User::getId, u -> u));

        List<Long> animeIds = rows.stream()
            .map(Activity::getAnimeId).filter(Objects::nonNull).distinct().toList();
        Map<Long, Anime> animeById = animes.findAllById(animeIds).stream()
            .collect(Collectors.toMap(Anime::getId, a -> a));

        return rows.stream().map(a -> FeedItemResponse.from(
            a,
            actorById.get(a.getActorId()) == null
                ? null
                : ActorRef.from(actorById.get(a.getActorId())),
            a.getAnimeId() == null || animeById.get(a.getAnimeId()) == null
                ? null
                : AnimeRef.from(animeById.get(a.getAnimeId()))
        )).toList();
    }
}
