package com.animesquad.user;

import com.animesquad.auth.InviteSignupTokenService.InviteProfile;
import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.SpyBean;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class UserServiceIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired UserRepository userRepository;
    @SpyBean GoogleUserCreator googleUserCreator;

    @Test
    void upsertByGoogleSub_createsNewUser_whenAbsent() {
        User u = userService.upsertFromGoogle(
            "google-sub-1", "alice@example.com", "Alice", "http://avatar/1");

        assertThat(u.getId()).isNotNull();
        assertThat(userRepository.findByGoogleSub("google-sub-1")).isPresent();
    }

    @Test
    void upsertByGoogleSub_preservesExistingProfile_whenExists() {
        userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob", "url1");
        User updated = userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob Renamed", "url2");

        // Existing users keep their self-edited profile; Google values do not overwrite.
        assertThat(updated.getDisplayName()).isEqualTo("Bob");
        assertThat(updated.getAvatarUrl()).isEqualTo("url1");
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void createFromGoogleIfAbsentReturnsSingleWinnerAfterConcurrentUniqueConflict() throws Exception {
        InviteProfile profile = new InviteProfile("racing-sub", "racing@example.com", "Racing");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<User>> futures = List.of(
                executor.submit(() -> createAfterBarrier(profile, ready, start)),
                executor.submit(() -> createAfterBarrier(profile, ready, start)));

            ready.await();
            start.countDown();

            User first = futures.get(0).get();
            User second = futures.get(1).get();
            assertThat(first.getId()).isEqualTo(second.getId());
        }

        assertThat(userRepository.count()).isEqualTo(1);
        assertThat(userRepository.findByGoogleSub("racing-sub")).isPresent();
        verify(googleUserCreator, times(2)).create(profile);
    }

    private User createAfterBarrier(
        InviteProfile profile,
        CountDownLatch ready,
        CountDownLatch start
    ) throws InterruptedException {
        ready.countDown();
        start.await();
        return userService.createFromGoogleIfAbsent(profile);
    }

    @Test
    void updateDisplayName_changesName() {
        User u = userService.upsertFromGoogle("sub-3", "carol@x.com", "Carol", "url");
        userService.updateDisplayName(u.getId(), "Caroline");

        assertThat(userService.getById(u.getId()).getDisplayName()).isEqualTo("Caroline");
    }

    @Test
    void updateAvatarUrl_changesAvatar() {
        User u = userService.upsertFromGoogle("sub-4", "dave@x.com", "Dave", "old");
        userService.updateAvatarUrl(u.getId(), "new-url");

        assertThat(userService.getById(u.getId()).getAvatarUrl()).isEqualTo("new-url");
    }
}
