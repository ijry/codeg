use axum::{
    body::Bytes,
    http::{header, HeaderValue, Request, StatusCode},
    response::IntoResponse,
};

pub async fn invoke(body: Bytes) -> impl IntoResponse {
    let request = Request::builder()
        .method("POST")
        .uri("/invoke")
        .body(body.to_vec());
    let Ok(request) = request else {
        return (
            StatusCode::BAD_REQUEST,
            [(header::CONTENT_TYPE, HeaderValue::from_static("application/json"))],
            br#"{"ok":false,"error":{"message":"Invalid noder request","code":"EINVAL"}}"#
                .to_vec(),
        );
    };

    let response = otools_platform_noder::handle_protocol_request(request);
    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("application/json"));
    (status, [(header::CONTENT_TYPE, content_type)], response.into_body())
}
