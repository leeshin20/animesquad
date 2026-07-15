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

    @Test
    void listMembers_returnsOwnerFirst_thenOtherMembers() {
        User owner = userService.upsertFromGoogle("g-lm-o", "lmo@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-lm-m", "lmm@x.y", "Member", null);
        Squad s = squadService.createSquad(owner.getId(), "S");
        squadService.joinByInviteCode(member.getId(), s.getInviteCode());

        List<com.animesquad.squad.dto.SquadMemberResponse> result =
            squadService.listMembers(owner.getId(), s.getId());

        assertThat(result).hasSize(2);
        assertThat(result.get(0).userId()).isEqualTo(owner.getId());
        assertThat(result.get(0).role()).isEqualTo(MembershipRole.OWNER);
        assertThat(result.get(1).userId()).isEqualTo(member.getId());
        assertThat(result.get(1).role()).isEqualTo(MembershipRole.MEMBER);
    }

    @Test
    void listMembers_throws_whenCallerNotMember() {
        User owner = userService.upsertFromGoogle("g-lm-o2", "lmo2@x.y", "Owner2", null);
        User stranger = userService.upsertFromGoogle("g-lm-s", "lms@x.y", "Stranger", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        assertThatThrownBy(() -> squadService.listMembers(stranger.getId(), s.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createSquad_throws_whenUserAlreadyHas3Squads() {
        User owner = userService.upsertFromGoogle("g-limit-1", "limit1@x.y", "Limit1", null);
        squadService.createSquad(owner.getId(), "S1");
        squadService.createSquad(owner.getId(), "S2");
        squadService.createSquad(owner.getId(), "S3");

        assertThatThrownBy(() -> squadService.createSquad(owner.getId(), "S4"))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasFieldOrPropertyWithValue("statusCode", org.springframework.http.HttpStatus.CONFLICT);
    }

    @Test
    void joinByInviteCode_throws_whenUserAlreadyHas3Squads() {
        User joiner = userService.upsertFromGoogle("g-limit-2", "limit2@x.y", "Limit2", null);
        squadService.createSquad(joiner.getId(), "S1");
        squadService.createSquad(joiner.getId(), "S2");
        squadService.createSquad(joiner.getId(), "S3");

        User owner4 = userService.upsertFromGoogle("g-limit-2-o", "limit2o@x.y", "Limit2Owner", null);
        Squad fourth = squadService.createSquad(owner4.getId(), "S4");

        assertThatThrownBy(() -> squadService.joinByInviteCode(joiner.getId(), fourth.getInviteCode()))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasFieldOrPropertyWithValue("statusCode", org.springframework.http.HttpStatus.CONFLICT);
    }

    @Test
    void joinByInviteCode_allowsRejoiningExistingSquad_evenAt3Squads() {
        User owner = userService.upsertFromGoogle("g-limit-3-o", "limit3o@x.y", "Limit3Owner", null);
        Squad first = squadService.createSquad(owner.getId(), "S1");

        User member = userService.upsertFromGoogle("g-limit-3-m", "limit3m@x.y", "Limit3Member", null);
        squadService.joinByInviteCode(member.getId(), first.getInviteCode());
        squadService.createSquad(member.getId(), "S2");
        squadService.createSquad(member.getId(), "S3");

        Squad rejoined = squadService.joinByInviteCode(member.getId(), first.getInviteCode());

        assertThat(rejoined.getId()).isEqualTo(first.getId());
    }
}
