package com.animesquad.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public User upsertFromGoogle(String googleSub, String email, String displayName, String avatarUrl) {
        // Existing users keep their (possibly self-edited) profile; only first
        // sign-in seeds displayName/avatar from Google.
        return repository.findByGoogleSub(googleSub)
            .orElseGet(() -> repository.save(new User(googleSub, email, displayName, avatarUrl)));
    }

    @Transactional(readOnly = true)
    public User getById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("user not found: " + id));
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
}
