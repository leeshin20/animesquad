package com.animesquad.squad;

import com.animesquad.auth.CurrentUser;
import com.animesquad.squad.dto.CreateSquadRequest;
import com.animesquad.squad.dto.JoinSquadRequest;
import com.animesquad.squad.dto.SquadResponse;
import com.animesquad.squad.dto.UpdateAnnouncementRequest;
import com.animesquad.squad.dto.UpdateNameRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

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
        return ResponseEntity.status(HttpStatus.CREATED).body(squadService.toResponse(s));
    }

    @GetMapping
    public List<SquadResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return squadService.listMySquads(me.userId()).stream()
            .map(squadService::toResponse).toList();
    }

    @GetMapping("/{id}")
    public SquadResponse detail(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return squadService.toResponse(squadService.getSquadForMember(me.userId(), id));
    }

    @PostMapping("/join")
    public SquadResponse join(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody JoinSquadRequest req
    ) {
        return squadService.toResponse(squadService.joinByInviteCode(me.userId(), req.inviteCode()));
    }

    @PostMapping("/{id}/avatar")
    public SquadResponse uploadAvatar(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id,
        @RequestParam("file") MultipartFile file
    ) {
        return squadService.toResponse(squadService.updateAvatar(me.userId(), id, file));
    }

    @PostMapping("/{id}/banner")
    public SquadResponse uploadBanner(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id,
        @RequestParam("file") MultipartFile file
    ) {
        return squadService.toResponse(squadService.updateBanner(me.userId(), id, file));
    }

    @PatchMapping("/{id}/name")
    public SquadResponse updateName(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id,
        @Valid @RequestBody UpdateNameRequest req
    ) {
        return squadService.toResponse(squadService.updateName(me.userId(), id, req.name()));
    }

    @PatchMapping("/{id}/announcement")
    public SquadResponse updateAnnouncement(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id,
        @RequestBody UpdateAnnouncementRequest req
    ) {
        return squadService.toResponse(
            squadService.updateAnnouncement(me.userId(), id, req.announcement()));
    }
}
