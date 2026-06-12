package com.animesquad.squad;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SquadService {

    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final InviteCodeGenerator codes;

    public SquadService(SquadRepository squads, MembershipRepository memberships, InviteCodeGenerator codes) {
        this.squads = squads;
        this.memberships = memberships;
        this.codes = codes;
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
