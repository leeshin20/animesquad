package com.animesquad.admin.watchimport;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.animesquad.admin.watchimport.AdminWatchImportDtos.AnimeRef;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.CommitItem;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.CommitResponse;
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
    private final WatchEntryRepository entries;

    public AdminWatchImportService(UserRepository users, AnimeRepository animes) {
        this(users, animes, null);
    }

    @Autowired
    public AdminWatchImportService(UserRepository users, AnimeRepository animes,
                                   WatchEntryRepository entries) {
        this.users = users;
        this.animes = animes;
        this.entries = entries;
    }

    public PreviewResponse preview(String email, String text) {
        if (email == null || email.isBlank() || text == null || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and text are required");
        }
        String[] physicalLines = text.split("\\R", -1);
        int physicalLineCount = physicalLines.length;
        if (physicalLines[physicalLines.length - 1].isEmpty()) {
            physicalLineCount--;
        }
        if (physicalLineCount > MAX_LINES) {
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

    @Transactional
    public CommitResponse commit(Long targetUserId, List<CommitItem> items) {
        if (targetUserId == null || items == null || items.isEmpty() || items.size() > MAX_LINES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "target user and 1-200 items are required");
        }
        if (!users.existsById(targetUserId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found");
        }
        if (items.stream().anyMatch(item -> item == null || item.animeId() == null
            || item.progress() == null || item.progress() < 1)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid import item");
        }
        Set<Long> animeIds = items.stream().map(CommitItem::animeId).collect(Collectors.toSet());
        if (animeIds.size() != items.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "duplicate anime id");
        }
        Map<Long, Anime> animeMap = animes.findAllById(animeIds).stream()
            .collect(Collectors.toMap(Anime::getId, Function.identity()));
        if (animeMap.size() != animeIds.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found");
        }

        Map<Long, WatchEntry> existingEntries = entries
            .findAllByUserIdAndAnimeIdIn(targetUserId, animeIds).stream()
            .collect(Collectors.toMap(WatchEntry::getAnimeId, Function.identity()));
        int created = 0;
        int updated = 0;
        try {
            for (CommitItem item : items) {
                WatchEntry entry = existingEntries.get(item.animeId());
                if (entry == null) {
                    entry = new WatchEntry(targetUserId, item.animeId(), WatchStatus.WATCHING);
                    entry.apply(null, item.progress(), null, null);
                    entries.save(entry);
                    created++;
                } else {
                    entry.apply(WatchStatus.WATCHING, item.progress(), null, null);
                    updated++;
                }
            }
            entries.flush();
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "watch entries changed during import", e);
        }
        return new CommitResponse(created, updated);
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
        if (expected.isEmpty()) {
            return new PreviewLine(lineNumber, raw, title, progress, LineStatus.INVALID,
                null, "제목에 문자나 숫자가 필요합니다");
        }
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
            .filter(candidate -> !candidate.isEmpty())
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
