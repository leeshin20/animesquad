package com.animesquad.episode;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import org.springframework.data.domain.Limit;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/me/episode-reviews")
public class MyEpisodeReviewController {

    public record MyEpisodeReview(
        Long id,
        AnimeRef anime,
        int episodeNumber,
        int score,
        String comment,
        OffsetDateTime updatedAt
    ) {}

    private final EpisodeRatingRepository ratings;
    private final AnimeRepository animes;

    public MyEpisodeReviewController(EpisodeRatingRepository ratings, AnimeRepository animes) {
        this.ratings = ratings;
        this.animes = animes;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<MyEpisodeReview> recent(
        @AuthenticationPrincipal CurrentUser me,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(defaultValue = "true") boolean commentOnly
    ) {
        int bounded = Math.max(1, Math.min(limit, 500));
        List<EpisodeRating> rows = commentOnly
            ? ratings.findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(me.userId(), Limit.of(bounded))
            : ratings.findAllByUserIdOrderByUpdatedAtDesc(me.userId(), Limit.of(bounded));
        if (rows.isEmpty()) return List.of();

        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(EpisodeRating::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));

        return rows.stream().map(r -> {
            Anime a = animeById.get(r.getAnimeId());
            return new MyEpisodeReview(
                r.getId(),
                a == null ? null : AnimeRef.from(a),
                r.getEpisodeNumber(),
                r.getScore(),
                r.getComment(),
                r.getUpdatedAt()
            );
        }).toList();
    }
}
