package com.animesquad.squad;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/squad/{squadId}/recent-watch")
public class SquadRecentWatchController {

    public record SquadWatchItem(
        Long id,
        AnimeRef anime,
        Integer episodes,
        WatchStatus status,
        int progress,
        Integer score,
        OffsetDateTime updatedAt,
        ActorRef actor
    ) {}

    private final MembershipRepository memberships;
    private final WatchEntryRepository entries;
    private final UserRepository users;
    private final AnimeRepository animes;

    public SquadRecentWatchController(
        MembershipRepository memberships,
        WatchEntryRepository entries,
        UserRepository users,
        AnimeRepository animes
    ) {
        this.memberships = memberships;
        this.entries = entries;
        this.users = users;
        this.animes = animes;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<SquadWatchItem> recent(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long squadId,
        @RequestParam(defaultValue = "10") int limit
    ) {
        if (!memberships.existsByUserIdAndSquadId(me.userId(), squadId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "squad not found");
        }
        int bounded = Math.max(1, Math.min(limit, 50));
        List<Long> memberIds = memberships.findAllBySquadId(squadId).stream()
            .map(Membership::getUserId)
            .toList();
        if (memberIds.isEmpty()) return List.of();

        // Seed with the most recent entries to pick which anime to show,
        // then fetch every member's entry for those anime so past watchers appear too.
        List<WatchEntry> seed = entries.findAllByUserIdInOrderByUpdatedAtDesc(memberIds, Limit.of(bounded));
        if (seed.isEmpty()) return List.of();
        List<Long> seedAnimeIds = seed.stream().map(WatchEntry::getAnimeId).distinct().toList();
        List<WatchEntry> rows =
            entries.findAllByUserIdInAndAnimeIdInOrderByUpdatedAtDesc(memberIds, seedAnimeIds);

        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(WatchEntry::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));
        Map<Long, User> userById = users.findAllById(
            rows.stream().map(WatchEntry::getUserId).distinct().toList()
        ).stream().collect(Collectors.toMap(User::getId, u -> u));

        return rows.stream().map(e -> {
            Anime a = animeById.get(e.getAnimeId());
            User u = userById.get(e.getUserId());
            return new SquadWatchItem(
                e.getId(),
                a == null ? null : AnimeRef.from(a),
                a == null ? null : a.getEpisodes(),
                e.getStatus(),
                e.getProgress(),
                e.getScore(),
                e.getUpdatedAt(),
                u == null ? null : ActorRef.from(u)
            );
        }).toList();
    }
}
