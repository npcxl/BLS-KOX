use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, Opts, Registry, TextEncoder,
};

pub fn registry() -> &'static Registry {
    use std::sync::OnceLock;
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(|| Registry::new())
}

pub fn metrics_text() -> anyhow::Result<String> {
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();
    encoder.encode(&registry().gather(), &mut buffer)?;
    Ok(String::from_utf8(buffer)?)
}

pub fn http_requests_total() -> &'static IntCounterVec {
    use std::sync::OnceLock;
    static METRIC: OnceLock<IntCounterVec> = OnceLock::new();
    METRIC.get_or_init(|| {
        let metric = IntCounterVec::new(
            Opts::new("bls_kox_http_requests_total", "HTTP requests total"),
            &["method", "path", "status"],
        )
        .expect("http_requests_total");
        registry()
            .register(Box::new(metric.clone()))
            .expect("register http_requests_total");
        metric
    })
}

pub fn http_request_duration_seconds() -> &'static HistogramVec {
    use std::sync::OnceLock;
    static METRIC: OnceLock<HistogramVec> = OnceLock::new();
    METRIC.get_or_init(|| {
        let metric = HistogramVec::new(
            HistogramOpts::new(
                "bls_kox_http_request_duration_seconds",
                "HTTP request duration",
            ),
            &["method", "path"],
        )
        .expect("http_request_duration_seconds");
        registry()
            .register(Box::new(metric.clone()))
            .expect("register http_request_duration_seconds");
        metric
    })
}
