package com.animesquad.squad;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class SquadServiceIT extends AbstractIntegrationTest {

    @Autowired SquadService squadService;
    @Autowired MembershipRepository memberships;
    @Autowired UserService userService;

    @Test
    void createSquad_persistsSquadAndOwnerMembership() {
        User owner = userService.upsertFromGoogle("g-owner", "owner@x.y", "Owner", null);

        Squad s = squadService.createSquad(owner.getId(), "My Squad");

        assertThat(s.getId()).isNotNull();
        assertThat(s.getName()).isEqualTo("My Squad");
        assertThat(s.getOwnerId()).isEqualTo(owner.getId());
        assertThat(s.getInviteCode()).hasSize(10);

        Membership m = memberships.findByUserIdAndSquadId(owner.getId(), s.getId()).orElseThrow();
        assertThat(m.getRole()).isEqualTo(MembershipRole.OWNER);
    }
}
