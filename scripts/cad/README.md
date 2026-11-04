# Hình robot từ CAD

`src/fanroc/assets/robot-maker.json` (Mẫu Maker) dựng từ mẫu Onshape "Bộ thingbot mới" của anh Tuấn
(assembly "vào xem cái này", xuất glTF). Mẫu CAD là tài sản riêng: hỏi anh Tuấn trước khi đăng công khai.

Chạy lại (cần `meshoptimizer` và `three`, cài ngoài kho này, ví dụ trong `~/Ai-Workspace/ThingBot-CAD/tools`):

```bash
cd ~/Ai-Workspace/ThingBot-CAD/tools   # có node_modules/meshoptimizer và three
node build-maker.mjs "../onshape/asm__vào xem cái này.gltf" <kho>/src/fanroc/assets/robot-maker.json
```

Công cụ gom chi tiết theo nhóm chuyển động (thân, 4 bánh, thanh răng, tay vòng), bỏ dây kéo / bóng mẫu / linh kiện tí
hon, hàn đỉnh, giảm tam giác (~195k → ~26k) và lượng tử hoá toạ độ (0,02 mm). Hệ toạ độ ra: mm, gốc giữa cả cụm robot
lúc thu trên sàn, +z mũi xe (phía lồng ống), y lên, +x bên trái.
