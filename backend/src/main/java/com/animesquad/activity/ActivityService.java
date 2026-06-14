package com.animesquad.activity;

import com.animesquad.squad.MembershipRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ActivityService {

    private static final int MAX_LIMIT = 100;

    private final ActivityRepository activities;
    private final MembershipRepository memberships;

    public ActivityService(ActivityRepository activities, MembershipRepository memberships) {
        this.activities = activities;
        this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public List<Activity> listForSquad(Long viewerId, Long squadId, Long cursor, int limit) {
        if (!memberships.existsByUserIdAndSquadId(viewerId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        int bounded = Math.max(1, Math.min(limit, MAX_LIMIT));
        Limit l = Limit.of(bounded);
        if (cursor == null) {
            return activities.findBySquadIdOrderByIdDesc(squadId, l);
        }
        return activities.findBySquadIdAndIdLessThanOrderByIdDesc(squadId, cursor, l);
    }
}
