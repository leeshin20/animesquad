package com.animesquad.squad;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    void joinByInviteCode_addsMembership() {
        User owner = userService.upsertFromGoogle("g-o2", "o2@x.y", "O2", null);
        User joiner = userService.upsertFromGoogle("g-j2", "j2@x.y", "J2", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        Squad joined = squadService.joinByInviteCode(joiner.getId(), s.getInviteCode());

        assertThat(joined.getId()).isEqualTo(s.getId());
        assertThat(memberships.existsByUserIdAndSquadId(joiner.getId(), s.getId())).isTrue();
    }

    @Test
    void joinByInviteCode_isIdempotent_whenAlreadyMember() {
        User u = userService.upsertFromGoogle("g-idem", "i@x.y", "I", null);
        Squad s = squadService.createSquad(u.getId(), "S");

        Squad again = squadService.joinByInviteCode(u.getId(), s.getInviteCode());

        assertThat(again.getId()).isEqualTo(s.getId());
        assertThat(memberships.findAllByUserId(u.getId())).hasSize(1);
    }

    @Test
    void joinByInviteCode_throws_whenCodeUnknown() {
        User u = userService.upsertFromGoogle("g-bad", "b@x.y", "B", null);

        assertThatThrownBy(() -> squadService.joinByInviteCode(u.getId(), "NOPENOPE12"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listMySquads_returnsOnlySquadsImIn() {
        User me = userService.upsertFromGoogle("g-me", "me@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-o", "o@x.y", "O", null);
        Squad mine = squadService.createSquad(me.getId(), "Mine");
        squadService.createSquad(other.getId(), "Theirs");

        List<Squad> result = squadService.listMySquads(me.getId());

        assertThat(result).extracting(Squad::getId).containsExactly(mine.getId());
    }

    @Test
    void getSquadForMember_returnsSquad_whenMember() {
        User me = userService.upsertFromGoogle("g-gm", "gm@x.y", "GM", null);
        Squad s = squadService.createSquad(me.getId(), "S");

        Squad got = squadService.getSquadForMember(me.getId(), s.getId());

        assertThat(got.getId()).isEqualTo(s.getId());
    }

    @Test
    void getSquadForMember_throws_whenNotMember() {
        User owner = userService.upsertFromGoogle("g-own", "own@x.y", "Own", null);
        User stranger = userService.upsertFromGoogle("g-str", "str@x.y", "Str", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        assertThatThrownBy(() -> squadService.getSquadForMember(stranger.getId(), s.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.activity.ActivityRepository activityRepo;

    @Test
    void joinByInviteCode_emitsActivity_butCreateDoesNot() {
        User owner = userService.upsertFromGoogle("g-evt-o", "evto@x.y", "EvtO", null);
        User joiner = userService.upsertFromGoogle("g-evt-j", "evtj@x.y", "EvtJ", null);
        Squad s = squadService.createSquad(owner.getId(), "S");
        assertThat(activityRepo.count()).isZero();

        squadService.joinByInviteCode(joiner.getId(), s.getInviteCode());

        assertThat(activityRepo.count()).isEqualTo(1);
        assertThat(activityRepo.findAll().get(0).getType())
            .isEqualTo(com.animesquad.activity.ActivityType.JOINED_SQUAD);
    }
}
