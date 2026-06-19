package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.auth.CurrentUser;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/anime")
public class AdminAnimeController {

    public record UpdateTitleKoreanRequest(String titleKorean) {}

    private final AnimeRepository animes;
    private final UserService users;
    private final AdminProperties adminProperties;

    public AdminAnimeController(AnimeRepository animes, UserService users, AdminProperties adminProperties) {
        this.animes = animes;
        this.users = users;
        this.adminProperties = adminProperties;
    }

    private void requireAdmin(CurrentUser current) {
        User u = users.getById(current.userId());
        if (!adminProperties.isAdminEmail(u.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin only");
        }
    }

    @GetMapping
    public List<AnimeResponse> list(@AuthenticationPrincipal CurrentUser current) {
        requireAdmin(current);
        return animes.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
            .map(AnimeResponse::from)
            .toList();
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
}
