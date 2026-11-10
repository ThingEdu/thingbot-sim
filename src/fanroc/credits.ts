// Nguồn của mọi thứ game dùng lại (mã, khối, CAD, luật). Hiện ở ⚙ › Nguồn và ghi đầy đủ trong NGUON.md ở gốc kho —
// phép thử credits.test.ts giữ hai chỗ khớp nhau. Thêm thư viện / tài sản mới thì thêm một dòng ở đây.

export interface Credit {
  /** Tên hiện cho người dùng. */
  name: string
  /** Lấy từ đâu: link gốc (kèm phiên bản / commit) hoặc ghi rõ tài liệu nội bộ của ai. */
  from: string
  /** Giấy phép / quyền dùng. */
  license: string
}

export const CREDITS: readonly Credit[] = [
  {
    name: 'Khối lệnh + bo ThingBot ảo (ThingBlock)',
    from: 'https://github.com/ThingEdu/thingblock-editor @866ff1cc8',
    license: 'AGPL-3.0 (scratch-gui, scratch-vm, thingblock-resource, thingblock-sim), Apache-2.0 (scratch-blocks)',
  },
  { name: 'Đồ hoạ 3D three.js', from: 'https://github.com/mrdoob/three.js r180 (three@0.180.0)', license: 'MIT' },
  {
    name: 'Vật lý Rapier',
    from: 'https://github.com/dimforge/rapier.js (@dimforge/rapier3d-compat@0.14.0)',
    license: 'Apache-2.0',
  },
  {
    name: 'Cách đặt vận tốc robot mỗi bước (UrSimulator)',
    from: 'https://github.com/AendeGitHub/UrSimulator src/sim/RobotSim.ts — viết lại cho đế ThingBot, không chép nguyên văn',
    license: 'MIT (Copyright (c) 2026 Khussein)',
  },
  { name: 'Đọc / ghi tệp .tb (JSZip)', from: 'https://github.com/Stuk/jszip (jszip@3.10.1)', license: 'MIT hoặc GPL-3.0' },
  {
    name: 'Số đo sân + lưới núi',
    from: 'CAD "Lắp sân.step" do anh Tuấn (ThingEdu) gửi 03/11/2026',
    license: 'của ThingEdu, đồng ý công khai 06/11/2026',
  },
  {
    name: 'Hình Mẫu Maker và linh kiện 3 mẫu cải tiến',
    from: 'CAD Onshape "Bộ thingbot mới" của anh Tuấn (ThingEdu)',
    license: 'của ThingEdu, đồng ý công khai 06/11/2026',
  },
  {
    name: 'Luật chơi',
    from: 'Thể lệ FANROC 2026–2027 của Ban tổ chức FANROC — game tóm tắt bằng lời riêng, không chép văn bản',
    license: 'tên FANROC dùng có xin phép (06/11/2026)',
  },
]
