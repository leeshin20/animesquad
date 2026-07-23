package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class AnimeFolderArchiveService {
    private static final int MAX_FOLDER_CODE_POINTS = 200;
    private static final int MAX_FOLDER_UTF8_BYTES = 240;
    private final AnimeRepository animes;

    public AnimeFolderArchiveService(AnimeRepository animes) { this.animes = animes; }
    public record Archive(byte[] bytes, String downloadFilename) {}

    @Transactional(readOnly = true)
    public Archive create(int year, String season) {
        int quarter = switch (season) {
            case "WINTER" -> 1; case "SPRING" -> 2;
            case "SUMMER" -> 3; case "FALL" -> 4;
            default -> throw new IllegalArgumentException("invalid season: " + season);
        };
        String root = year + "년/";
        String quarterRoot = root + year + "년 " + quarter + "분기/";
        Set<String> used = new HashSet<>();
        List<Anime> selected = animes
            .findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(year, season);
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            addDirectory(zip, root);
            addDirectory(zip, quarterRoot);
            for (Anime anime : selected) {
                if (!anime.getTitleKorean().isBlank()) {
                    addDirectory(zip, quarterRoot + uniqueFolderName(anime, used) + "/");
                }
            }
            zip.finish();
            return new Archive(bytes.toByteArray(),
                year + "년-" + quarter + "분기-애니-음원-폴더.zip");
        } catch (IOException e) {
            throw new IllegalStateException("failed to create anime folder archive", e);
        }
    }

    private static String safeComponent(String value) {
        return value.trim().replace('/', '-').replace('\\', '-').replace(':', '-').replace('\0', '-')
            .replaceAll("\\s+", " ").replaceAll("[. ]+$", "");
    }

    private static int utf8Length(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static String truncate(String value, int maxCodePoints, int maxUtf8Bytes) {
        int end = 0;
        int codePoints = 0;
        int utf8Bytes = 0;
        while (end < value.length() && codePoints < maxCodePoints) {
            int codePoint = value.codePointAt(end);
            int codePointBytes = utf8Length(new String(Character.toChars(codePoint)));
            if (utf8Bytes + codePointBytes > maxUtf8Bytes) break;
            end += Character.charCount(codePoint);
            codePoints++;
            utf8Bytes += codePointBytes;
        }
        return value.substring(0, end);
    }

    private static String folderName(Anime anime, String suffix) {
        String korean = safeComponent(anime.getTitleKorean());
        String romaji = safeComponent(anime.getTitleRomaji());
        if (romaji.isEmpty()) romaji = "-";

        String wrapperAndSuffix = " ()" + suffix;
        String minimumRomaji = truncate(romaji, 1, MAX_FOLDER_UTF8_BYTES);
        int koreanCodePointBudget = MAX_FOLDER_CODE_POINTS
            - wrapperAndSuffix.codePointCount(0, wrapperAndSuffix.length()) - 1;
        int koreanByteBudget = MAX_FOLDER_UTF8_BYTES
            - utf8Length(wrapperAndSuffix) - utf8Length(minimumRomaji);
        String limitedKorean = truncate(korean, koreanCodePointBudget, koreanByteBudget);

        int romajiCodePointBudget = MAX_FOLDER_CODE_POINTS
            - wrapperAndSuffix.codePointCount(0, wrapperAndSuffix.length())
            - limitedKorean.codePointCount(0, limitedKorean.length());
        int romajiByteBudget = MAX_FOLDER_UTF8_BYTES
            - utf8Length(wrapperAndSuffix) - utf8Length(limitedKorean);
        String limitedRomaji = truncate(romaji, romajiCodePointBudget, romajiByteBudget);
        return limitedKorean + " (" + limitedRomaji + ")" + suffix;
    }

    private static String uniqueFolderName(Anime anime, Set<String> used) {
        String base = folderName(anime, "");
        if (used.add(base)) return base;
        String suffix = anime.getAnilistId() != null
            ? " [AniList-" + anime.getAnilistId() + "]"
            : " [AnimeSquad-" + anime.getId() + "]";
        String unique = folderName(anime, suffix);
        used.add(unique);
        return unique;
    }

    private static void addDirectory(ZipOutputStream zip, String path) throws IOException {
        zip.putNextEntry(new ZipEntry(path));
        zip.closeEntry();
    }
}
