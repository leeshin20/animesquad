package com.animesquad.anime;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.auth.CurrentUser;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/anime/{animeId}/squad-watch")
public class AnimeSquadWatchController {

    public record MemberWatch(
        ActorRef actor, WatchStatus status, int progress,
        Integer score, String comment, OffsetDateTime updatedAt
    ) {}
    public record SquadGroup(Long squadId, String squadName, List<MemberWatch> members) {}

    private final MembershipRepository memberships;
    private final SquadRepository squads;
    private final WatchEntryRepository entries;
    private final UserRepository users;

    public AnimeSquadWatchController(
        MembershipRepository memberships, SquadRepository squads,
        WatchEntryRepository entries, UserRepository users
    ) {
        this.memberships = memberships;
        this.squads = squads;
        this.entries = entries;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<SquadGroup> squadWatch(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        List<Membership> mine = memberships.findAllByUserId(me.userId());
        List<SquadGroup> out = new ArrayList<>();
        for (Membership m : mine) {
            Long squadId = m.getSquadId();
            List<Long> memberIds = memberships.findAllBySquadId(squadId).stream()
                .map(Membership::getUserId)
                .filter(uid -> !uid.equals(me.userId()))
                .toList();
            if (memberIds.isEmpty()) continue;

            List<WatchEntry> rows = entries.findAllByAnimeIdAndUserIdIn(animeId, memberIds);
            if (rows.isEmpty()) continue;

            Map<Long, User> userById = users.findAllById(
                rows.stream().map(WatchEntry::getUserId).distinct().toList()
            ).stream().collect(Collectors.toMap(User::getId, u -> u));

            Squad squad = squads.findById(squadId).orElse(null);
            if (squad == null) continue;

            List<MemberWatch> members = rows.stream().map(e -> {
                User u = userById.get(e.getUserId());
                return new MemberWatch(
                    u == null ? null : ActorRef.from(u),
                    e.getStatus(), e.getProgress(), e.getScore(),
                    e.getComment(), e.getUpdatedAt());
            }).toList();

            out.add(new SquadGroup(squadId, squad.getName(), members));
        }
        return out;
    }
}
