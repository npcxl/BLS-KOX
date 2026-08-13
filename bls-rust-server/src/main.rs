use bls_rust_server::app;
use bls_rust_server::config::Config;
use bls_rust_server::state::AppState;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bls_rust_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    let state = AppState::new(config).await?;
    let port = state.config.port;

    {
        let worker_state = state.clone();
        tokio::spawn(async move { bls_rust_server::queue::worker::run(worker_state.db).await });
    }
    {
        let outbox_state = state.clone();
        tokio::spawn(async move {
            loop {
                let _ = bls_rust_server::outbox::publisher::publish_due(
                    &outbox_state.db,
                    &outbox_state,
                )
                .await;
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        });
    }

    let app = app(state);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("bls-rust-server listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
