package com.animesquad.admin.watchimport;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.animesquad.admin.watchimport.AdminWatchImportDtos.AnimeRef;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.LineStatus;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewLine;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewResponse;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.TargetUser;

@Service
public class AdminWatchImportService {
    private static final int MAX_LINES = 200;
    private static final Pattern LINE_PATTERN = Pattern.compile("^(.+?)(\\d+)화\\s*$");

    private final UserRepository users;
    private final AnimeRepository animes;

    public AdminWatchImportService(UserRepository users, AnimeRepository animes) {
        this.users = users;
        this.animes = animes;
    }

    public PreviewResponse preview(String email, String text) {
        if (email == null || email.isBlank() || text == null || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and text are required");
        }
        String[] physicalLines = text.split("\\R", -1);
        if (physicalLines.length > MAX_LINES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "maximum 200 lines");
        }
        User target = users.findByEmailIgnoreCase(email.trim())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        List<Anime> cachedAnime = animes.findAll();
        List<PreviewLine> lines = new ArrayList<>();
        for (int index = 0; index < physicalLines.length; index++) {
            String raw = physicalLines[index];
            if (raw.isBlank()) {
                continue;
            }
            lines.add(previewLine(index + 1, raw, cachedAnime));
        }
        markEarlierDuplicates(lines);
        return new PreviewResponse(
            new TargetUser(target.getId(), target.getEmail(), target.getDisplayName()),
            List.copyOf(lines));
    }

    static String normalizeTitle(String value) {
        if (value == null) {
            return "";
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT);
        return normalized.codePoints()
            .filter(Character::isLetterOrDigit)
            .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
            .toString();
    }

    private PreviewLine previewLine(int lineNumber, String raw, List<Anime> cachedAnime) {
        Matcher matcher = LINE_PATTERN.matcher(raw);
        if (!matcher.matches()) {
            return new PreviewLine(lineNumber, raw, null, null, LineStatus.INVALID,
                null, "제목과 진도를 확인해 주세요");
        }

        String title = matcher.group(1).trim();
        int progress;
        try {
            progress = Integer.parseInt(matcher.group(2));
        } catch (NumberFormatException e) {
            return new PreviewLine(lineNumber, raw, title, null, LineStatus.INVALID,
                null, "진도가 올바르지 않습니다");
        }
        if (progress < 1) {
            return new PreviewLine(lineNumber, raw, title, progress, LineStatus.INVALID,
                null, "진도는 1 이상이어야 합니다");
        }

        String expected = normalizeTitle(title);
        Map<Long, Anime> candidates = new LinkedHashMap<>();
        cachedAnime.stream()
            .filter(anime -> matchesExactNormalizedTitle(anime, expected))
            .forEach(anime -> candidates.putIfAbsent(anime.getId(), anime));
        if (candidates.size() != 1) {
            return new PreviewLine(lineNumber, raw, title, progress, LineStatus.UNMATCHED,
                null, candidates.isEmpty() ? "일치하는 작품이 없습니다" : "일치하는 작품이 여러 개입니다");
        }

        Anime anime = candidates.values().iterator().next();
        return new PreviewLine(lineNumber, raw, title, progress, LineStatus.MATCHED,
            new AnimeRef(anime.getId(), anime.getTitleKorean(), anime.getTitleRomaji(),
                anime.getCoverImageUrl()), null);
    }

    private boolean matchesExactNormalizedTitle(Anime anime, String expected) {
        Stream<String> titles = Stream.of(
            anime.getTitleKorean(), anime.getTitleNative(),
            anime.getTitleEnglish(), anime.getTitleRomaji());
        Stream<String> aliases = anime.getSearchKeywords() == null
            ? Stream.empty()
            : Arrays.stream(anime.getSearchKeywords().split(",|\\R"));
        return Stream.concat(titles, aliases)
            .filter(Objects::nonNull)
            .map(AdminWatchImportService::normalizeTitle)
            .anyMatch(expected::equals);
    }

    private void markEarlierDuplicates(List<PreviewLine> lines) {
        Set<Long> seenAnimeIds = new HashSet<>();
        for (int index = lines.size() - 1; index >= 0; index--) {
            PreviewLine line = lines.get(index);
            if (line.status() != LineStatus.MATCHED) {
                continue;
            }
            if (!seenAnimeIds.add(line.anime().id())) {
                lines.set(index, new PreviewLine(line.lineNumber(), line.rawLine(), line.title(),
                    line.progress(), LineStatus.DUPLICATE, null, "뒤의 동일 작품 입력으로 대체됨"));
            }
        }
    }
}
