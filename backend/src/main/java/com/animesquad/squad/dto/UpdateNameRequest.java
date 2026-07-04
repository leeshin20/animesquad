package com.animesquad.squad.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateNameRequest(
    @NotBlank @Size(min = 1, max = 30) String name
) {}
