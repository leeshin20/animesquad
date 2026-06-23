package com.animesquad.anime;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/anime/{animeId}/reviews")
public class AnimeReviewsController {

    public record ReviewItem(
        ActorRef actor, WatchStatus status, int progress,
        Integer score, String comment, OffsetDateTime updatedAt
    ) {}

    private final WatchEntryRepository entries;
    private final UserRepository users;

    public AnimeReviewsController(WatchEntryRepository entries, UserRepository users) {
        this.entries = entries;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ReviewItem> reviews(@PathVariable Long animeId) {
        List<WatchEntry> rows = entries.findAllByAnimeIdOrderByUpdatedAtDesc(animeId).stream()
            .filter(e -> e.getComment() != null && !e.getComment().isBlank())
            .toList();
        if (rows.isEmpty()) return List.of();

        Map<Long, User> userById = users.findAllById(
            rows.stream().map(WatchEntry::getUserId).distinct().toList()
        ).stream().collect(Collectors.toMap(User::getId, u -> u));

        return rows.stream().map(e -> {
            User u = userById.get(e.getUserId());
            return new ReviewItem(
                u == null ? null : ActorRef.from(u),
                e.getStatus(), e.getProgress(), e.getScore(),
                e.getComment(), e.getUpdatedAt());
        }).toList();
    }
}
