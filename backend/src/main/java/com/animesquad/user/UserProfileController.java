package com.animesquad.user;

import com.animesquad.auth.CurrentUser;
import com.animesquad.user.dto.UserProfileResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserProfileController {

    private final UserProfileService service;

    public UserProfileController(UserProfileService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public UserProfileResponse get(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return service.getProfile(me.userId(), id);
    }
}
