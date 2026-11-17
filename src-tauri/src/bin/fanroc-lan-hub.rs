//! Hub LAN chạy riêng (không cửa sổ) cho dev / e2e trên trình duyệt: `cargo run --bin fanroc-lan-hub [cổng]`.
//! Cùng mã với hub trong app (lan.rs); in "hub <địa chỉ>" khi đã nghe.

fn main() {
    let port: u16 = std::env::args().nth(1).and_then(|p| p.parse().ok()).unwrap_or(app_lib::lan::HUB_PORT);
    let rt = tokio::runtime::Runtime::new().expect("tokio");
    rt.block_on(async {
        let hub = app_lib::lan::start_hub(([127, 0, 0, 1], port).into()).await.expect("không mở được cổng hub");
        println!("hub {}", hub.addr);
        std::future::pending::<()>().await;
    });
}
