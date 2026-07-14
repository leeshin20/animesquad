package com.animesquad.user;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.auth.InviteSignupTokenService.InviteProfile;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.SquadRepository;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

@Service
public class UserService {

    private final UserRepository repository;
    private final GoogleUserCreator googleUserCreator;
    private final SquadRepository squadRepository;
    private final MembershipRepository membershipRepository;
    private final WatchEntryRepository watchEntryRepository;
    private final EpisodeRatingRepository episodeRatingRepository;
    private final ActivityRepository activityRepository;

    public UserService(
        UserRepository repository,
        GoogleUserCreator googleUserCreator,
        SquadRepository squadRepository,
        MembershipRepository membershipRepository,
        WatchEntryRepository watchEntryRepository,
        EpisodeRatingRepository episodeRatingRepository,
        ActivityRepository activityRepository
    ) {
        this.repository = repository;
        this.googleUserCreator = googleUserCreator;
        this.squadRepository = squadRepository;
        this.membershipRepository = membershipRepository;
        this.watchEntryRepository = watchEntryRepository;
        this.episodeRatingRepository = episodeRatingRepository;
        this.activityRepository = activityRepository;
    }

    @Transactional
    public User upsertFromGoogle(String googleSub, String email, String displayName, String avatarUrl) {
        return repository.findByGoogleSub(googleSub)
            .orElseGet(() -> repository.save(new User(googleSub, email, displayName, avatarUrl)));
    }

    @Transactional(readOnly = true)
    public Optional<User> findByGoogleSub(String googleSub) {
        return repository.findByGoogleSub(googleSub);
    }

    @Transactional
    public User createFromGoogleIfAbsent(InviteProfile profile) {
        return repository.findByGoogleSub(profile.googleSub()).orElseGet(() -> {
            try {
                return googleUserCreator.create(profile);
            } catch (DataIntegrityViolationException conflict) {
                return repository.findByGoogleSub(profile.googleSub()).orElseThrow(() -> conflict);
            }
        });
    }

    @Transactional(readOnly = true)
    public User getById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "user not found"));
    }

    @Transactional
    public User updateDisplayName(Long id, String displayName) {
        User user = getById(id);
        user.updateDisplayName(displayName);
        return user;
    }

    @Transactional
    public User updateAvatarUrl(Long id, String avatarUrl) {
        User user = getById(id);
        user.updateAvatarUrl(avatarUrl);
        return user;
    }

    @Transactional
    public User updateProfileVisibility(Long id, ProfileVisibility visibility) {
        User user = getById(id);
        user.updateProfileVisibility(visibility);
        return user;
    }

    @Transactional
    public void agreeTerms(Long userId) {
        User user = getById(userId);
        user.agreeTerms();
    }

    @Transactional
    public void deleteAccount(Long userId) {
        if (squadRepository.existsByOwnerId(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "스쿼드를 먼저 삭제해주세요");
        }
        membershipRepository.deleteAllByUserId(userId);
        watchEntryRepository.deleteAllByUserId(userId);
        episodeRatingRepository.deleteAllByUserId(userId);
        activityRepository.deleteAllByActorId(userId);
        repository.deleteById(userId);
    }
}
