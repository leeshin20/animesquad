package com.animesquad.anime;

import java.util.List;

public interface AniListClient {
    List<AniListMedia> search(String query);
    AniListMedia fetchById(int anilistId);
}
