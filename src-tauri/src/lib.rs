//! Gói desktop của ThingBot FanRoc Game: một cửa sổ mở trang game (`dist-game/`, nhúng trong gói), không cần mạng,
//! không máy chủ, không sidecar. Plugin opener chỉ để mở link mã nguồn AGPL bằng trình duyệt (quyền ở capabilities/). Toàn bộ game (3D, vật lý Rapier WASM, bo ThingBot ảo trong Worker) chạy trong WebView.

use std::path::{Path, PathBuf};
use tauri::Manager;

/// Tên tệp .tb an toàn: chỉ phần tên (không thư mục), bỏ ký tự cấm, luôn đuôi `.tb`.
fn safe_tb_name(name: &str) -> String {
    let base = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("");
    let clean: String = base.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control()).collect();
    let stem = clean.trim().trim_end_matches(".tb").trim();
    format!("{}.tb", if stem.is_empty() { "chuong-trinh" } else { stem })
}

/// Đường chưa có tệp trong `dir`: `ten.tb`, `ten (2).tb`, `ten (3).tb`, …
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let stem = name.trim_end_matches(".tb");
    let mut path = dir.join(name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).tb"));
        n += 1;
    }
    path
}

/// Lưu chương trình .tb vào thư mục Downloads của máy. WKWebView (macOS) bỏ qua link `download` khi app không xử lý
/// tải tệp, nên app desktop gọi lệnh này thay cho link; trả về đường tệp đã lưu để trang báo cho học sinh.
#[tauri::command]
fn save_tb(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &safe_tb_name(&name));
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_tb])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_tb_name_keeps_only_a_plain_file_name() {
        assert_eq!(safe_tb_name("fanroc-maker.tb"), "fanroc-maker.tb");
        assert_eq!(safe_tb_name("../../etc/passwd"), "passwd.tb");
        assert_eq!(safe_tb_name("a:b*?.tb"), "ab.tb");
        assert_eq!(safe_tb_name(""), "chuong-trinh.tb");
    }

    #[test]
    fn free_path_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("fanroc-save-tb-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("x.tb"), b"1").unwrap();
        assert_eq!(free_path(&dir, "x.tb"), dir.join("x (2).tb"));
        assert_eq!(free_path(&dir, "y.tb"), dir.join("y.tb"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
