package com.animesquad.common;

import java.util.Map;

public record ApiErrorResponse(String code, String message, Map<String, Object> details) {
    public static ApiErrorResponse of(String code, String message) {
        return new ApiErrorResponse(code, message, null);
    }
}
