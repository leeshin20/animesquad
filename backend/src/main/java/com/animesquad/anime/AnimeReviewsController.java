package com.animesquad.anime;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.episode.EpisodeRating;
import com.animesquad.episode.EpisodeRatingRepository;
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
@RequestMapping("/api/anime/{animeId}")
public class AnimeReviewsController {

    public record ReviewItem(
        ActorRef actor, WatchStatus status, int progress,
        Integer score, String comment, OffsetDateTime updatedAt
    ) {}

    public record EpisodeReviewItem(
        ActorRef actor, int episodeNumber, Integer score, String comment, OffsetDateTime updatedAt
    ) {}

    public record AnimeStats(Double averageScore, int watcherCount) {}

    private final WatchEntryRepository entries;
    private final EpisodeRatingRepository episodeRatings;
    private final UserRepository users;

    public AnimeReviewsController(WatchEntryRepository entries,
                                  EpisodeRatingRepository episodeRatings,
                                  UserRepository users) {
        this.entries = entries;
        this.episodeRatings = episodeRatings;
        this.users = users;
    }

    @GetMapping("/reviews")
    @Transactional(readOnly = true)
    public List<ReviewItem> reviews(@PathVariable Long animeId) {
        List<WatchEntry> rows = entries.findAllByAnimeIdOrderByUpdatedAtDesc(animeId).stream()
            .filter(e -> e.getComment() != null && !e.getComment().isBlank())
            .toList();
        if (rows.isEmpty()) return List.of();

        Map<Long, User> userById = usersByIds(rows.stream().map(WatchEntry::getUserId));

        return rows.stream().map(e -> {
            User u = userById.get(e.getUserId());
            return new ReviewItem(
                u == null ? null : ActorRef.from(u),
                e.getStatus(), e.getProgress(), e.getScore(),
                e.getComment(), e.getUpdatedAt());
        }).toList();
    }

    @GetMapping("/episode-reviews")
    @Transactional(readOnly = true)
    public List<EpisodeReviewItem> episodeReviews(@PathVariable Long animeId) {
        List<EpisodeRating> rows = episodeRatings
            .findAllByAnimeIdOrderByEpisodeNumberAscUpdatedAtDesc(animeId).stream()
            .filter(r -> r.getComment() != null && !r.getComment().isBlank())
            .toList();
        if (rows.isEmpty()) return List.of();

        Map<Long, User> userById = usersByIds(rows.stream().map(EpisodeRating::getUserId));

        return rows.stream().map(r -> {
            User u = userById.get(r.getUserId());
            return new EpisodeReviewItem(
                u == null ? null : ActorRef.from(u),
                r.getEpisodeNumber(), r.getScore(), r.getComment(), r.getUpdatedAt());
        }).toList();
    }

    @GetMapping("/stats")
    @Transactional(readOnly = true)
    public AnimeStats stats(@PathVariable Long animeId) {
        List<WatchEntry> rows = entries.findAllByAnimeIdOrderByUpdatedAtDesc(animeId);
        Double average = rows.stream()
            .map(WatchEntry::getScore).filter(s -> s != null)
            .mapToInt(Integer::intValue).average().stream().boxed().findFirst().orElse(null);
        return new AnimeStats(average, rows.size());
    }

    private Map<Long, User> usersByIds(java.util.stream.Stream<Long> userIds) {
        return users.findAllById(userIds.distinct().toList())
            .stream().collect(Collectors.toMap(User::getId, u -> u));
    }
}
