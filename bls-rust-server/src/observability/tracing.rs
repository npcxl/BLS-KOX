pub fn init_tracing() {
    let _ = tracing_subscriber::fmt::try_init();
}
