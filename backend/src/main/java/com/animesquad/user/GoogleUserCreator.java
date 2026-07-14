package com.animesquad.user;

import com.animesquad.auth.InviteSignupTokenService.InviteProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleUserCreator {

    private final UserRepository repository;

    public GoogleUserCreator(UserRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public User create(InviteProfile profile) {
        return repository.saveAndFlush(new User(
            profile.googleSub(), profile.email(), profile.displayName(), null));
    }
}
