use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

pub const WS_EVENT_PROTOCOL: &str = "codeg-events";
const WS_TOKEN_PROTOCOL_PREFIX: &str = "codeg-token.";

fn token_from_ws_protocols(value: &str) -> Option<String> {
    value
        .split(',')
        .map(str::trim)
        .find_map(|protocol| protocol.strip_prefix(WS_TOKEN_PROTOCOL_PREFIX))
        .and_then(|encoded| URL_SAFE_NO_PAD.decode(encoded).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

fn token_from_query(value: &str) -> Option<String> {
    value.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        if key != "codegToken" && key != "codeg_token" {
            return None;
        }
        urlencoding::decode(value).ok().map(|decoded| decoded.into_owned())
    })
}

fn request_has_token(request: &Request, token: &str, allow_query: bool) -> bool {
    if let Some(auth_header) = request.headers().get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.strip_prefix("Bearer ").is_some_and(|t| t == token) {
                return true;
            }
        }
    }

    if let Some(protocol_header) = request.headers().get("sec-websocket-protocol") {
        if let Ok(protocols) = protocol_header.to_str() {
            if token_from_ws_protocols(protocols).is_some_and(|t| t == token) {
                return true;
            }
        }
    }

    allow_query
        && request
            .uri()
            .query()
            .and_then(token_from_query)
            .is_some_and(|t| t == token)
}

pub async fn require_token(request: Request, next: Next, token: String) -> Response {
    // Fail closed on a misconfigured empty token: otherwise `Bearer ` (an empty
    // bearer value) would match it and silently disable authentication.
    if token.is_empty() {
        return (StatusCode::UNAUTHORIZED, "Server token is not configured").into_response();
    }

    if request_has_token(&request, &token, false) {
        return next.run(request).await;
    }

    (StatusCode::UNAUTHORIZED, "Invalid or missing token").into_response()
}

pub async fn require_token_or_query(request: Request, next: Next, token: String) -> Response {
    if token.is_empty() {
        return (StatusCode::UNAUTHORIZED, "Server token is not configured").into_response();
    }

    if request_has_token(&request, &token, true) {
        return next.run(request).await;
    }

    (StatusCode::UNAUTHORIZED, "Invalid or missing token").into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    #[test]
    fn parses_token_from_ws_protocols() {
        let token = "secret/token+value";
        let encoded = URL_SAFE_NO_PAD.encode(token);
        assert_eq!(
            token_from_ws_protocols(&format!("codeg-events, codeg-token.{encoded}")).as_deref(),
            Some(token)
        );
    }

    #[test]
    fn ignores_invalid_ws_protocol_token() {
        assert!(token_from_ws_protocols("codeg-events, codeg-token.not-valid-@@@@").is_none());
    }

    #[test]
    fn parses_codeg_token_from_query() {
        assert_eq!(
            token_from_query("path=C%3A%5Cfoo.png&codegToken=secret%2Ftoken").as_deref(),
            Some("secret/token")
        );
        assert_eq!(
            token_from_query("codeg_token=another%20secret").as_deref(),
            Some("another secret")
        );
    }
}
