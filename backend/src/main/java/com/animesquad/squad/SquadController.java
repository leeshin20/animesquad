package com.animesquad.squad;

import com.animesquad.auth.CurrentUser;
import com.animesquad.squad.dto.CreateSquadRequest;
import com.animesquad.squad.dto.JoinSquadRequest;
import com.animesquad.squad.dto.SquadResponse;
import com.animesquad.squad.dto.UpdateAnnouncementRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/squad")
public class SquadController {

    private final SquadService squadService;

    public SquadController(SquadService squadService) {
        this.squadService = squadService;
    }

    @PostMapping
    public ResponseEntity<SquadResponse> create(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody CreateSquadRequest req
    ) {
        Squad s = squadService.createSquad(me.userId(), req.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(SquadResponse.from(s));
    }

    @GetMapping
    public List<SquadResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return squadService.listMySquads(me.userId()).stream()
            .map(SquadResponse::from).toList();
    }

    @GetMapping("/{id}")
    public SquadResponse detail(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return SquadResponse.from(squadService.getSquadForMember(me.userId(), id));
    }

    @PostMapping("/join")
    public SquadResponse join(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody JoinSquadRequest req
    ) {
        return SquadResponse.from(squadService.joinByInviteCode(me.userId(), req.inviteCode()));
    }

    @PatchMapping("/{id}/announcement")
    public SquadResponse updateAnnouncement(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id,
        @RequestBody UpdateAnnouncementRequest req
    ) {
        return SquadResponse.from(
            squadService.updateAnnouncement(me.userId(), id, req.announcement()));
    }
}
