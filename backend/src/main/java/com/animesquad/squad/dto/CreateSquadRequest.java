package com.animesquad.squad.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSquadRequest(
    @NotBlank @Size(max = 80) String name
) {}
