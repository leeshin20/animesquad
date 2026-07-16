package com.animesquad.anime;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/anime")
public class AnimeAliasController {

    public record AddAliasRequest(
        @NotBlank(message = "alias is required")
        String alias
    ) {}

    private final AnimeAliasService aliases;

    public AnimeAliasController(AnimeAliasService aliases) {
        this.aliases = aliases;
    }

    @PostMapping("/{animeId}/aliases")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addAlias(
        @PathVariable Long animeId,
        @Valid @RequestBody AddAliasRequest body
    ) {
        aliases.addAlias(animeId, body.alias());
    }
}
