package com.animesquad.user;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.auth.InviteSignupTokenService.InviteProfile;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.SquadRepository;
import com.animesquad.watch.WatchEntryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserServiceTest {

    private final UserRepository repository = mock(UserRepository.class);
    private final UserService service = new UserService(
        repository,
        mock(SquadRepository.class),
        mock(MembershipRepository.class),
        mock(WatchEntryRepository.class),
        mock(EpisodeRatingRepository.class),
        mock(ActivityRepository.class));

    @Test
    void createFromGoogleIfAbsentReturnsExistingUser() {
        InviteProfile profile = new InviteProfile("known", "known@example.com", "Known");
        User existing = new User("known", "known@example.com", "Known", null);
        when(repository.findByGoogleSub("known")).thenReturn(Optional.of(existing));

        User result = service.createFromGoogleIfAbsent(profile);

        assertThat(result).isSameAs(existing);
        verify(repository, never()).saveAndFlush(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void createFromGoogleIfAbsentReturnsConcurrentWinnerAfterUniqueConflict() {
        InviteProfile profile = new InviteProfile("racing", "racing@example.com", "Racing");
        User winner = new User("racing", "racing@example.com", "Winner", null);
        when(repository.findByGoogleSub("racing"))
            .thenReturn(Optional.empty())
            .thenReturn(Optional.of(winner));
        when(repository.saveAndFlush(org.mockito.ArgumentMatchers.any(User.class)))
            .thenThrow(new DataIntegrityViolationException("duplicate"));

        User result = service.createFromGoogleIfAbsent(profile);

        assertThat(result).isSameAs(winner);
        verify(repository).saveAndFlush(org.mockito.ArgumentMatchers.any(User.class));
    }
}
