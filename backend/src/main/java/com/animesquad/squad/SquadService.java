package com.animesquad.squad;

import com.animesquad.squad.dto.SquadResponse;
import com.animesquad.squad.events.SquadJoinedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class SquadService {

    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final InviteCodeGenerator codes;
    private final ApplicationEventPublisher events;

    public SquadService(SquadRepository squads, MembershipRepository memberships,
                        InviteCodeGenerator codes, ApplicationEventPublisher events) {
        this.squads = squads;
        this.memberships = memberships;
        this.codes = codes;
        this.events = events;
    }

    @Transactional
    public Squad createSquad(Long ownerId, String name) {
        Squad squad = squads.save(new Squad(name, ownerId, generateUniqueCode()));
        memberships.save(new Membership(ownerId, squad.getId(), MembershipRole.OWNER));
        return squad;
    }

    @Transactional
    public Squad joinByInviteCode(Long userId, String inviteCode) {
        Squad squad = squads.findByInviteCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("invite code not found"));
        if (!memberships.existsByUserIdAndSquadId(userId, squad.getId())) {
            memberships.save(new Membership(userId, squad.getId(), MembershipRole.MEMBER));
            events.publishEvent(new SquadJoinedEvent(userId, squad.getId()));
        }
        return squad;
    }

    @Transactional(readOnly = true)
    public List<Squad> listMySquads(Long userId) {
        List<Long> squadIds = memberships.findAllByUserId(userId).stream()
            .map(Membership::getSquadId).toList();
        return squads.findAllById(squadIds);
    }

    @Transactional(readOnly = true)
    public Squad getSquadForMember(Long userId, Long squadId) {
        if (!memberships.existsByUserIdAndSquadId(userId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        return squads.findById(squadId)
            .orElseThrow(() -> new IllegalArgumentException("squad not found"));
    }

    @Transactional
    public Squad updateAnnouncement(Long userId, Long squadId, String announcement) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateAnnouncement(announcement);
        return squads.save(squad);
    }

    @Transactional
    public Squad updateAvatarUrl(Long userId, Long squadId, String url) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateAvatarUrl(url);
        return squads.save(squad);
    }

    @Transactional
    public Squad updateBannerUrl(Long userId, Long squadId, String url) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateBannerUrl(url);
        return squads.save(squad);
    }

    @Transactional
    public Squad updateName(Long userId, Long squadId, String name) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateName(name);
        return squads.save(squad);
    }

    public SquadResponse toResponse(Squad squad) {
        return SquadResponse.from(squad, memberships.countBySquadId(squad.getId()));
    }

    private Squad getOwnerSquad(Long userId, Long squadId) {
        Squad squad = getSquadForMember(userId, squadId);
        if (!squad.getOwnerId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "스쿼드 관리자만 수정할 수 있어요");
        }
        return squad;
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.next();
            if (!squads.existsByInviteCode(code)) return code;
        }
        throw new IllegalStateException("could not generate unique invite code");
    }
}
