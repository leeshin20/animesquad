package com.animesquad.squad;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class MembershipRepositoryIT extends AbstractIntegrationTest {

    @Autowired MembershipRepository memberships;
    @Autowired SquadRepository squads;
    @Autowired UserService users;

    @Test
    void countBySquadIdIn_returnsCountsForAllRequestedSquads() {
        User owner = users.upsertFromGoogle("g-mr1", "mr1@x.y", "Owner", null);
        User member = users.upsertFromGoogle("g-mr2", "mr2@x.y", "Member", null);
        Squad first = squads.save(new Squad("First", owner.getId(), "COUNT001"));
        Squad second = squads.save(new Squad("Second", owner.getId(), "COUNT002"));
        memberships.save(new Membership(owner.getId(), first.getId(), MembershipRole.OWNER));
        memberships.save(new Membership(member.getId(), first.getId(), MembershipRole.MEMBER));
        memberships.save(new Membership(owner.getId(), second.getId(), MembershipRole.OWNER));

        Map<Long, Long> counts = memberships.countBySquadIdIn(java.util.List.of(first.getId(), second.getId()))
            .stream()
            .collect(Collectors.toMap(
                MembershipRepository.SquadMemberCount::getSquadId,
                MembershipRepository.SquadMemberCount::getMemberCount));

        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of(
            first.getId(), 2L,
            second.getId(), 1L));
    }
}
