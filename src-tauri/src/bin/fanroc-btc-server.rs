//! Máy chủ BTC chạy riêng (không cửa sổ) cho e2e: `cargo run --features btc-server --bin fanroc-btc-server -- <cổng> <thư mục>`.
//! Cùng mã với máy chủ trong app (btc.rs); phục vụ tệp tĩnh từ <thư mục>, in "btc <địa chỉ>" khi đã nghe.

use std::path::PathBuf;
use std::sync::Arc;

fn main() {
    let mut args = std::env::args().skip(1);
    let port: u16 = args.next().and_then(|p| p.parse().ok()).unwrap_or(app_lib::btc::BTC_PORT);
    let dir = PathBuf::from(args.next().unwrap_or_else(|| ".".into()));
    let files = app_lib::btc::dir_files(dir);
    let rt = tokio::runtime::Runtime::new().expect("tokio");
    rt.block_on(async {
        let server = app_lib::btc::start_server(([127, 0, 0, 1], port).into(), Arc::clone(&files)).await.expect("không mở được cổng BTC");
        println!("btc {}", server.addr);
        std::future::pending::<()>().await;
    });
}
