package com.animesquad.squad;

import com.animesquad.squad.dto.SquadMemberResponse;
import com.animesquad.squad.dto.SquadResponse;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.user.AvatarStorage;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SquadService {

    private static final int MAX_SQUADS_PER_USER = 3;

    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final InviteCodeGenerator codes;
    private final ApplicationEventPublisher events;
    private final AvatarStorage storage;

    public SquadService(SquadRepository squads, MembershipRepository memberships,
                        UserRepository users, InviteCodeGenerator codes,
                        ApplicationEventPublisher events, AvatarStorage storage) {
        this.squads = squads;
        this.memberships = memberships;
        this.users = users;
        this.codes = codes;
        this.events = events;
        this.storage = storage;
    }

    @Transactional
    public Squad createSquad(Long ownerId, String name) {
        assertUnderSquadLimit(ownerId);
        Squad squad = squads.save(new Squad(name, ownerId, generateUniqueCode()));
        memberships.save(new Membership(ownerId, squad.getId(), MembershipRole.OWNER));
        return squad;
    }

    @Transactional
    public Squad joinByInviteCode(Long userId, String inviteCode) {
        Squad squad = squads.findByInviteCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("invite code not found"));
        if (!memberships.existsByUserIdAndSquadId(userId, squad.getId())) {
            assertUnderSquadLimit(userId);
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
    public Squad updateAvatar(Long userId, Long squadId, MultipartFile file) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateAvatarUrl(storage.store(file));
        return squads.save(squad);
    }

    @Transactional
    public Squad updateBanner(Long userId, Long squadId, MultipartFile file) {
        Squad squad = getOwnerSquad(userId, squadId);
        squad.updateBannerUrl(storage.store(file));
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

    @Transactional(readOnly = true)
    public List<SquadMemberResponse> listMembers(Long userId, Long squadId) {
        if (!memberships.existsByUserIdAndSquadId(userId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        List<Membership> squadMemberships = memberships.findAllBySquadId(squadId);
        Map<Long, User> userById = users.findAllById(
                squadMemberships.stream().map(Membership::getUserId).distinct().toList()).stream()
            .collect(Collectors.toMap(User::getId, u -> u));

        return squadMemberships.stream()
            .map(m -> SquadMemberResponse.from(userById.get(m.getUserId()), m.getRole()))
            .sorted(Comparator.comparing(r -> r.role() == MembershipRole.OWNER ? 0 : 1))
            .toList();
    }

    private Squad getOwnerSquad(Long userId, Long squadId) {
        Squad squad = getSquadForMember(userId, squadId);
        if (!squad.getOwnerId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "스쿼드 관리자만 수정할 수 있어요");
        }
        return squad;
    }

    private void assertUnderSquadLimit(Long userId) {
        if (memberships.findAllByUserId(userId).size() >= MAX_SQUADS_PER_USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "스쿼드는 최대 3개까지만 참여할 수 있어요");
        }
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.next();
            if (!squads.existsByInviteCode(code)) return code;
        }
        throw new IllegalStateException("could not generate unique invite code");
    }
}
