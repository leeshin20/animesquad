package com.animesquad.squad.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record JoinSquadRequest(
    @NotBlank @Size(max = 16) String inviteCode
) {}
