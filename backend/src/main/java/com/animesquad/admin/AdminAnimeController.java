package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.anime.AnimeService;
import com.animesquad.anime.ExcludedAnime;
import com.animesquad.anime.ExcludedAnimeRepository;
import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.activity.ActivityRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntryRepository;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/admin/anime")
public class AdminAnimeController {

    public record UpdateAnimeRequest(String titleKorean, String searchKeywords) {}
    public record BulkCacheSeasonRequest(Integer year, String season) {}
    public record BulkCacheResult(int cached) {}
    public record BulkDeleteRequest(List<Long> ids) {}
    public record BulkDeleteResult(int deleted, int skipped) {}

    private static final java.util.Set<String> VALID_SEASONS =
        java.util.Set.of("WINTER", "SPRING", "SUMMER", "FALL");

    private final AnimeRepository animes;
    private final AnimeService animeService;
    private final ExcludedAnimeRepository excluded;
    private final UserService users;
    private final AdminProperties adminProperties;
    private final WatchEntryRepository watches;
    private final EpisodeRatingRepository episodeRatings;
    private final ActivityRepository activities;
    private final com.animesquad.watch.EpisodeWatchRepository history;
    private final AnimeFolderArchiveService folderArchives;

    public AdminAnimeController(AnimeRepository animes, AnimeService animeService,
                                UserService users, AdminProperties adminProperties,
                                WatchEntryRepository watches, EpisodeRatingRepository episodeRatings,
                                ActivityRepository activities, AnimeFolderArchiveService folderArchives,
                                ExcludedAnimeRepository excluded, com.animesquad.watch.EpisodeWatchRepository history) {
        this.animes = animes; this.history = history;
        this.excluded = excluded;
        this.animeService = animeService;
        this.users = users;
        this.adminProperties = adminProperties;
        this.watches = watches;
        this.episodeRatings = episodeRatings;
        this.activities = activities;
        this.folderArchives = folderArchives;
    }

    @GetMapping("/folder-archive")
    public ResponseEntity<byte[]> folderArchive(
        @AuthenticationPrincipal CurrentUser current,
        @RequestParam(required = false) String year,
        @RequestParam(required = false) String season
    ) {
        requireAdmin(current);
        int parsedYear;
        try {
            parsedYear = Integer.parseInt(year);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid year");
        }
        if (parsedYear < 1960 || parsedYear > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid year");
        }
        String normalized = season == null ? "" : season.toUpperCase(java.util.Locale.ROOT);
        if (!VALID_SEASONS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "season must be WINTER/SPRING/SUMMER/FALL");
        }
        AnimeFolderArchiveService.Archive archive = folderArchives.create(parsedYear, normalized);
        String disposition = "attachment; filename=\"anime-folders-" + parsedYear + "-" + normalized
            + ".zip\"; filename*=UTF-8''"
            + UriUtils.encode(archive.downloadFilename(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
            .body(archive.bytes());
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
            String stripped = raw.replace(" ", "");
            String like = "%" + raw.toLowerCase(java.util.Locale.ROOT) + "%";
            String likeStripped = "%" + stripped.toLowerCase(java.util.Locale.ROOT) + "%";
            result = animes.searchByTitle(like, "%" + raw + "%", likeStripped, "%" + stripped + "%");
        }
        return result.stream().map(AnimeResponse::from).toList();
    }

    @GetMapping("/excluded")
    public List<ExcludedAnime> listExcluded(
        @AuthenticationPrincipal CurrentUser current,
        @RequestParam(required = false) String q
    ) {
        requireAdmin(current);
        String query = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT).replace(" ", "");
        return excluded.findAllByOrderByExcludedAtDescIdDesc().stream()
            .filter(a -> query.isEmpty() || java.util.stream.Stream.of(
                a.getTitleRomaji(), a.getTitleNative(), a.getTitleEnglish(), a.getTitleKorean(), a.getSearchKeywords())
                .filter(java.util.Objects::nonNull)
                .anyMatch(title -> title.toLowerCase(java.util.Locale.ROOT).replace(" ", "").contains(query)))
            .toList();
    }

    @PostMapping("/excluded/{id}/restore")
    @Transactional
    public AnimeResponse restore(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id
    ) {
        requireAdmin(current);
        excluded.lockCatalog();
        ExcludedAnime snapshot = excluded.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "excluded anime not found"));
        Anime anime = animes.save(snapshot.restore());
        excluded.delete(snapshot);
        return AnimeResponse.from(anime);
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
    public AnimeResponse update(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id,
        @RequestBody UpdateAnimeRequest body
    ) {
        requireAdmin(current);
        Anime anime = animes.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        anime.setTitleKorean(normalize(body.titleKorean()));
        anime.setSearchKeywords(normalize(body.searchKeywords()));
        return AnimeResponse.from(anime);
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @PostMapping("/bulk-delete")
    @Transactional
    public BulkDeleteResult bulkDelete(
        @AuthenticationPrincipal CurrentUser current,
        @RequestBody BulkDeleteRequest body
    ) {
        requireAdmin(current);
        if (body.ids() == null || body.ids().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ids required");
        }
        excluded.lockCatalog();
        int deleted = 0;
        int skipped = 0;
        for (Long id : body.ids()) {
            Anime anime = animes.findById(id).orElse(null);
            if (anime == null
                || watches.existsByAnimeId(id) || episodeRatings.existsByAnimeId(id) || activities.existsByAnimeId(id) || history.existsByAnimeId(id)) {
                skipped++;
                continue;
            }
            excluded.save(ExcludedAnime.from(anime));
            animes.delete(anime);
            deleted++;
        }
        return new BulkDeleteResult(deleted, skipped);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id
    ) {
        requireAdmin(current);
        excluded.lockCatalog();
        Anime anime = animes.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        if (watches.existsByAnimeId(id) || episodeRatings.existsByAnimeId(id) || activities.existsByAnimeId(id) || history.existsByAnimeId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 시청·평가 기록이 있어 제외할 수 없어요");
        }
        excluded.save(ExcludedAnime.from(anime));
        animes.delete(anime);
        return ResponseEntity.noContent().build();
    }
}
