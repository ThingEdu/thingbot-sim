# Nguồn

ThingBot FanRoc Game dùng lại các phần dưới đây. Danh sách này khớp với mục ⚙ › Nguồn trong game
(`src/fanroc/credits.ts`; phép thử `credits.test.ts` giữ hai chỗ khớp nhau).

| Phần | Lấy từ | Giấy phép / quyền dùng |
|---|---|---|
| Khối lệnh + bo ThingBot ảo (ThingBlock) | https://github.com/ThingEdu/thingblock-editor commit `866ff1cc8` (thư mục anh em `../thingblock-editor-sim`, CI tải đúng commit này) | AGPL-3.0 (scratch-gui, scratch-vm, thingblock-resource, thingblock-sim), Apache-2.0 (scratch-blocks) |
| Đồ hoạ 3D three.js | https://github.com/mrdoob/three.js r180 (`three@0.180.0`) | MIT |
| Vật lý Rapier | https://github.com/dimforge/rapier.js (`@dimforge/rapier3d-compat@0.14.0`) | Apache-2.0 |
| Đọc / ghi tệp .tb (JSZip) | https://github.com/Stuk/jszip (`jszip@3.10.1`) | MIT hoặc GPL-3.0 |
| Số đo sân + lưới núi | CAD "Lắp sân.step" do anh Tuấn (ThingEdu) gửi 03/11/2026 → `src/fanroc/layout.ts`, `src/fanroc/assets/mountain-mesh.json` | của ThingEdu, đồng ý công khai 06/11/2026 |
| Hình Mẫu Maker và linh kiện 3 mẫu cải tiến | CAD Onshape "Bộ thingbot mới" của anh Tuấn (ThingEdu) → `src/fanroc/assets/robot-maker.json`, `robot-parts.json` (công cụ `scripts/cad/`) | của ThingEdu, đồng ý công khai 06/11/2026 |
| Luật chơi | Thể lệ FANROC 2026–2027 của Ban tổ chức FANROC — game tóm tắt bằng lời riêng, không chép văn bản | tên FANROC dùng có xin phép (06/11/2026) |

Mã của game: AGPL-3.0 (`LICENSE`), https://github.com/ThingEdu/thingbot-sim nhánh `feat/fanroc`.
