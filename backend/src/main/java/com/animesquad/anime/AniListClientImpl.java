package com.animesquad.anime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
public class AniListClientImpl implements AniListClient {

    private static final String SEARCH_QUERY = """
        query ($q: String) {
          Page(perPage: 20) {
            media(search: $q, type: ANIME) {
              id
              title { romaji native english }
              coverImage { large }
              episodes
              status
              format
              seasonYear
            }
          }
        }
        """;

    private static final String BY_ID_QUERY = """
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { romaji native english }
            coverImage { large }
            episodes
            status
            format
            seasonYear
          }
        }
        """;

    private final RestClient client;

    public AniListClientImpl(@Value("${app.anilist.url}") String url) {
        this.client = RestClient.builder().baseUrl(url).build();
    }

    @Override
    public List<AniListMedia> search(String query) {
        Map<?, ?> resp = post(SEARCH_QUERY, Map.of("q", query));
        if (resp == null) return List.of();
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return List.of();
        Map<?, ?> page = (Map<?, ?>) data.get("Page");
        if (page == null) return List.of();
        List<?> media = (List<?>) page.get("media");
        if (media == null) return List.of();
        return media.stream().map(this::toMedia).toList();
    }

    @Override
    public AniListMedia fetchById(int anilistId) {
        Map<?, ?> resp = post(BY_ID_QUERY, Map.of("id", anilistId));
        if (resp == null) return null;
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return null;
        Object media = data.get("Media");
        if (media == null) return null;
        return toMedia(media);
    }

    private Map<?, ?> post(String query, Map<String, Object> variables) {
        return client.post()
            .body(Map.of("query", query, "variables", variables))
            .retrieve()
            .body(Map.class);
    }

    @SuppressWarnings("unchecked")
    private AniListMedia toMedia(Object raw) {
        Map<String, Object> m = (Map<String, Object>) raw;
        Map<String, Object> title = (Map<String, Object>) m.get("title");
        Map<String, Object> cover = (Map<String, Object>) m.get("coverImage");
        return new AniListMedia(
            ((Number) m.get("id")).intValue(),
            (String) title.get("romaji"),
            (String) title.get("native"),
            (String) title.get("english"),
            cover != null ? (String) cover.get("large") : null,
            m.get("episodes") == null ? null : ((Number) m.get("episodes")).intValue(),
            (String) m.get("status"),
            (String) m.get("format"),
            m.get("seasonYear") == null ? null : ((Number) m.get("seasonYear")).intValue()
        );
    }
}
