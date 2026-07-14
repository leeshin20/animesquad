package com.animesquad.user;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.episode.EpisodeRating;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.episode.MyEpisodeReviewController.MyEpisodeReview;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.SquadRepository;
import com.animesquad.user.dto.PublicSquadRef;
import com.animesquad.user.dto.UserProfileResponse;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.dto.WatchEntryResponse;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class UserProfileService {

    private final UserRepository users;
    private final WatchEntryRepository watchEntries;
    private final AnimeRepository animes;
    private final EpisodeRatingRepository episodeRatings;
    private final MembershipRepository memberships;
    private final SquadRepository squads;

    public UserProfileService(
        UserRepository users,
        WatchEntryRepository watchEntries,
        AnimeRepository animes,
        EpisodeRatingRepository episodeRatings,
        MembershipRepository memberships,
        SquadRepository squads
    ) {
        this.users = users;
        this.watchEntries = watchEntries;
        this.animes = animes;
        this.episodeRatings = episodeRatings;
        this.memberships = memberships;
        this.squads = squads;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(Long viewerId, Long targetId) {
        User target = users.findById(targetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        boolean isSelf = viewerId.equals(targetId);
        boolean accessible = isSelf
            || target.getProfileVisibility() == ProfileVisibility.PUBLIC
            || (target.getProfileVisibility() == ProfileVisibility.SQUAD_ONLY && sharesSquad(viewerId, targetId));

        if (!accessible) {
            return new UserProfileResponse(
                target.getId(), target.getDisplayName(), target.getAvatarUrl(), false, null, null, null);
        }

        return new UserProfileResponse(
            target.getId(), target.getDisplayName(), target.getAvatarUrl(), true,
            buildRecentWatched(targetId), buildRecentEpisodeReviews(targetId), buildSquads(targetId));
    }

    private boolean sharesSquad(Long viewerId, Long targetId) {
        Set<Long> viewerSquadIds = memberships.findAllByUserId(viewerId).stream()
            .map(Membership::getSquadId).collect(Collectors.toSet());
        return memberships.findAllByUserId(targetId).stream()
            .anyMatch(m -> viewerSquadIds.contains(m.getSquadId()));
    }

    private List<WatchEntryResponse> buildRecentWatched(Long userId) {
        List<WatchEntry> entries = watchEntries.findAllByUserIdOrderByUpdatedAtDesc(userId);
        Map<Long, Anime> animeById = animes.findAllById(
            entries.stream().map(WatchEntry::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));
        return entries.stream()
            .map(e -> WatchEntryResponse.from(e, animeById.get(e.getAnimeId())))
            .toList();
    }

    private List<MyEpisodeReview> buildRecentEpisodeReviews(Long userId) {
        List<EpisodeRating> rows = episodeRatings.findAllByUserIdOrderByUpdatedAtDesc(userId, Limit.of(500));
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

    private List<PublicSquadRef> buildSquads(Long userId) {
        List<Long> squadIds = memberships.findAllByUserId(userId).stream()
            .map(Membership::getSquadId).toList();
        return squads.findAllById(squadIds).stream()
            .map(s -> new PublicSquadRef(s.getId(), s.getName(), s.getAvatarUrl(), memberships.countBySquadId(s.getId())))
            .toList();
    }
}
