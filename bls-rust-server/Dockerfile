FROM rust:1.97-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/bls-rust-server /usr/local/bin/bls-rust-server
ENV APP_HOST=0.0.0.0 APP_PORT=7001
EXPOSE 7001
CMD ["bls-rust-server"]