package com.animesquad.episode;

import com.animesquad.auth.CurrentUser;
import com.animesquad.episode.dto.EpisodeRatingResponse;
import com.animesquad.episode.dto.RateEpisodeRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/watch/{animeId}/episodes")
public class EpisodeRatingController {

    private final EpisodeRatingService service;

    public EpisodeRatingController(EpisodeRatingService service) {
        this.service = service;
    }

    @PutMapping("/{ep}")
    public EpisodeRatingResponse rate(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @PathVariable("ep") int episodeNumber,
        @Valid @RequestBody RateEpisodeRequest req
    ) {
        EpisodeRating r = service.upsertRating(
            me.userId(), animeId, episodeNumber, req.score(), req.comment());
        return EpisodeRatingResponse.from(r);
    }

    @GetMapping
    public List<EpisodeRatingResponse> list(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        return service.listForUserAnime(me.userId(), animeId).stream()
            .map(EpisodeRatingResponse::from).toList();
    }

    @DeleteMapping("/{ep}")
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @PathVariable("ep") int episodeNumber
    ) {
        service.deleteRating(me.userId(), animeId, episodeNumber);
        return ResponseEntity.noContent().build();
    }
}
