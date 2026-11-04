//! Gói desktop của ThingBot FanRoc Game: một cửa sổ mở trang game (`dist-game/`, nhúng trong gói), không cần mạng,
//! không máy chủ, không sidecar. Plugin opener chỉ để mở link mã nguồn AGPL bằng trình duyệt (quyền ở capabilities/). Toàn bộ game (3D, vật lý Rapier WASM, bo ThingBot ảo trong Worker) chạy trong WebView.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Bản phát hành không có chỗ nào khác để xem lỗi của trang: mở trình kiểm tra khi đặt biến môi trường
            // (như THINGBLOCK_DEVTOOLS của thingblock-desktop), không mở sẵn cho mọi người dùng.
            if std::env::var_os("FANROC_DEVTOOLS").is_some() {
                if let Some(window) = app.webview_windows().values().next() {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
