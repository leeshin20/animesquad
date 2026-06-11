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
    void upsertByGoogleSub_updatesProfile_whenExists() {
        userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob", "url1");
        User updated = userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob Renamed", "url2");

        assertThat(updated.getDisplayName()).isEqualTo("Bob Renamed");
        assertThat(updated.getAvatarUrl()).isEqualTo("url2");
        assertThat(userRepository.count()).isEqualTo(1);
    }
}
