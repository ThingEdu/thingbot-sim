//! Gói desktop của ThingBot FanRoc Game: một cửa sổ mở trang game (`dist-game/`, nhúng trong gói), không máy chủ ngoài,
//! không sidecar; chỉ Thi qua mạng LAN mở socket trong mạng nội bộ (lan.rs). Plugin opener chỉ để mở link mã nguồn AGPL bằng trình duyệt (quyền ở capabilities/). Toàn bộ game (3D, vật lý Rapier WASM, bo ThingBot ảo trong Worker) chạy trong WebView.

pub mod btc;
pub mod lan;

use std::path::{Path, PathBuf};
use tauri::Manager;

/// Tên tệp .tb an toàn: chỉ phần tên (không thư mục), bỏ ký tự cấm, luôn đuôi `.tb`.
fn safe_tb_name(name: &str) -> String {
    let base = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("");
    let clean: String = base.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control()).collect();
    let stem = clean.trim().trim_end_matches(".tb").trim();
    format!("{}.tb", if stem.is_empty() { "chuong-trinh" } else { stem })
}

/// Đường chưa có tệp trong `dir`, giữ đuôi của `name`: `ten.tb`, `ten (2).tb`, `ten (3).tb`, …
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut path = dir.join(name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    path
}

/// Tên tệp an toàn cho save_file: chỉ phần tên, bỏ ký tự cấm; chỉ nhận đuôi `.xlsx` / `.json` (không phân biệt hoa thường).
fn safe_file_name(name: &str) -> Option<String> {
    let base = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("");
    let clean: String = base.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control()).collect();
    let clean = clean.trim();
    let i = clean.rfind('.')?;
    let ext = clean[i..].to_ascii_lowercase();
    if ext != ".xlsx" && ext != ".json" {
        return None;
    }
    let stem = clean[..i].trim();
    Some(format!("{}{ext}", if stem.is_empty() { "giai" } else { stem }))
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

/// Lưu tệp của màn Ban tổ chức (Excel xuất giải, file mẫu, sao lưu JSON) vào Downloads, như save_tb nhưng giữ đuôi
/// `.xlsx` / `.json` (đuôi khác ⇒ từ chối); trả đường tệp đã lưu.
#[tauri::command]
fn save_file(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    let name = safe_file_name(&name).ok_or_else(|| "Chỉ lưu được tệp .xlsx hoặc .json".to_string())?;
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &name);
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(lan::LanState::default())
        .manage(btc::BtcState::default())
        .invoke_handler(tauri::generate_handler![
            save_tb,
            save_file,
            lan::lan_host_start,
            lan::lan_host_stop,
            lan::lan_rooms,
            lan::lan_connect,
            lan::lan_disconnect,
            btc::btc_start,
            btc::btc_stop,
            btc::btc_save,
            btc::btc_load
        ])
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
        std::fs::write(dir.join("giai.xlsx"), b"1").unwrap();
        assert_eq!(free_path(&dir, "giai.xlsx"), dir.join("giai (2).xlsx"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn safe_file_name_keeps_only_xlsx_or_json() {
        assert_eq!(safe_file_name("giai-ha-noi.xlsx").as_deref(), Some("giai-ha-noi.xlsx"));
        assert_eq!(safe_file_name("../../x/giai.JSON").as_deref(), Some("giai.json"));
        assert_eq!(safe_file_name("a:b*?.xlsx").as_deref(), Some("ab.xlsx"));
        assert_eq!(safe_file_name(".xlsx").as_deref(), Some("giai.xlsx"));
        assert_eq!(safe_file_name("x.exe"), None);
        assert_eq!(safe_file_name("x.xlsx.sh"), None);
        assert_eq!(safe_file_name("khong-duoi"), None);
    }
}
