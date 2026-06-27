package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.anime.AnimeService;
import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.activity.ActivityRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/anime")
public class AdminAnimeController {

    public record UpdateTitleKoreanRequest(String titleKorean) {}
    public record BulkCacheSeasonRequest(Integer year, String season) {}
    public record BulkCacheResult(int cached) {}

    private static final java.util.Set<String> VALID_SEASONS =
        java.util.Set.of("WINTER", "SPRING", "SUMMER", "FALL");

    private final AnimeRepository animes;
    private final AnimeService animeService;
    private final UserService users;
    private final AdminProperties adminProperties;
    private final WatchEntryRepository watches;
    private final EpisodeRatingRepository episodeRatings;
    private final ActivityRepository activities;

    public AdminAnimeController(AnimeRepository animes, AnimeService animeService,
                                UserService users, AdminProperties adminProperties,
                                WatchEntryRepository watches, EpisodeRatingRepository episodeRatings,
                                ActivityRepository activities) {
        this.animes = animes;
        this.animeService = animeService;
        this.users = users;
        this.adminProperties = adminProperties;
        this.watches = watches;
        this.episodeRatings = episodeRatings;
        this.activities = activities;
    }

    private void requireAdmin(CurrentUser current) {
        User u = users.getById(current.userId());
        if (!adminProperties.isAdminEmail(u.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin only");
        }
    }

    @GetMapping
    public List<AnimeResponse> list(
        @AuthenticationPrincipal CurrentUser current,
        @RequestParam(required = false) String q
    ) {
        requireAdmin(current);
        List<Anime> result;
        if (q == null || q.isBlank()) {
            // Default view is the work queue: only anime still missing a Korean title.
            result = animes.findByTitleKoreanIsNullOrderByIdDesc();
        } else {
            // Search spans everything (Korean-titled included) so entries can be re-edited.
            String raw = q.trim();
            String like = "%" + raw.toLowerCase(java.util.Locale.ROOT) + "%";
            result = animes.searchByTitle(like, "%" + raw + "%", Limit.of(100));
        }
        return result.stream().map(AnimeResponse::from).toList();
    }

    @PostMapping("/bulk-cache-season")
    public BulkCacheResult bulkCacheSeason(
        @AuthenticationPrincipal CurrentUser current,
        @RequestBody BulkCacheSeasonRequest body
    ) {
        requireAdmin(current);
        if (body.year() == null || body.year() < 1960 || body.year() > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid year");
        }
        String season = body.season() == null ? "" : body.season().toUpperCase();
        if (!VALID_SEASONS.contains(season)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "season must be WINTER/SPRING/SUMMER/FALL");
        }
        int n = animeService.bulkCacheSeason(body.year(), season);
        return new BulkCacheResult(n);
    }

    @PatchMapping("/{id}")
    @Transactional
    public AnimeResponse updateTitleKorean(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id,
        @RequestBody UpdateTitleKoreanRequest body
    ) {
        requireAdmin(current);
        Anime anime = animes.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        String value = body.titleKorean() == null ? null : body.titleKorean().trim();
        anime.setTitleKorean(value == null || value.isEmpty() ? null : value);
        return AnimeResponse.from(anime);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id
    ) {
        requireAdmin(current);
        Anime anime = animes.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        if (watches.existsByAnimeId(id) || episodeRatings.existsByAnimeId(id) || activities.existsByAnimeId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 시청·평가 기록이 있어 삭제할 수 없어요");
        }
        animes.delete(anime);
        return ResponseEntity.noContent().build();
    }
}
