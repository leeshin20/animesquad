package com.animesquad.user;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.assertThat;

class UserServiceIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired UserRepository userRepository;

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
