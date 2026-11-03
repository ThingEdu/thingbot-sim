// FANROC 2026 "Thanh Hỏa" — mô hình trận 2D dạng tác tử (bản thử bỏ đi).
// Đơn vị mm và giây. Gốc toạ độ ở góc dưới-trái, y = 0 là thành sân phía Khu vực Điều khiển.
// Toạ độ các vùng ước lượng theo Hình 1 của luật (chưa có CAD sân). Robot không va chạm vật lý;
// cơ cấu nhận/thả bóng là thời gian + xác suất thành công. Chạy được cả trong Node lẫn trình duyệt.
(function (root) {
  'use strict';

  const F = 2400;
  const ZONES = {
    start: { red: [500, 1200, 0, 300], blue: [1200, 1900, 0, 300] },
    load: { red: [0, 375, 0, 375], blue: [2025, 2400, 0, 375] },
    safe: { red: [0, 375, 1050, 1425], blue: [2025, 2400, 1050, 1425] },
    fire: [[0, 600, 1800, 2400], [1800, 2400, 1800, 2400]],
  };
  const MOUNTAINS = [[840, 850], [1560, 850], [840, 1550], [1560, 1550]];
  const M_HALF = 200;
  const TIER_CAP = [25, 13, 8];
  const TIER_PTS = [5, 10, 15];
  const MATCH_S = 180, START_S = 10, ENDGAME_S = 30, DT = 0.1;

  // Thông số robot mẫu. speed: mm/s khi đi thẳng; turn: s mất thêm mỗi lần đổi hướng.
  const TYPES = {
    maker: { name: 'Mẫu Maker', w: 240, l: 315, speed: 450, turn: 0.7, intake: 'select', pick: 3.2, cap: 6,
      hpLoad: true, flag: true, flagT: 6, fireDrop: 0.8, mtn: [0.92, 0.85, 0.7], mtnDrop: [1.4, 1.8, 2.6] },
    ui: { name: 'Xe Ủi', w: 180, l: 240, speed: 500, turn: 0.5, intake: 'bulk', pick: 0.8, cap: 15,
      hpLoad: false, flag: false, fireDrop: 0.3, mtn: null },
    co: { name: 'Xe Cắm Cờ', w: 185, l: 280, speed: 420, turn: 0.7, intake: 'none', cap: 12,
      hpLoad: true, flag: true, flagT: 4, fireDrop: 0.6, mtn: [0.95, 0.92, 0.85], mtnDrop: [1.0, 1.2, 1.5] },
    sort: { name: 'Xe Phân Loại', w: 240, l: 260, speed: 430, turn: 0.7, intake: 'sort', pick: 2.0, cap: 5,
      hpLoad: false, flag: false, fireDrop: 0.5, mtn: [0.88, 0.65, 0], mtnDrop: [1.2, 1.8, 9] },
  };
  // Mức người lái / agent.
  const SKILLS = {
    easy: { name: 'Dễ', dead: 0.25, stuck: 0.06, speed: 0.6, time: 1.6, succ: -0.15, err: 0.15, roll: 0.2, flagOk: 0.65, hpT: 1.2, pen: 0.6 },
    medium: { name: 'Vừa', dead: 0.12, stuck: 0.04, speed: 0.8, time: 1.25, succ: -0.06, err: 0.07, roll: 0.12, flagOk: 0.85, hpT: 0.95, pen: 0.3 },
    hard: { name: 'Khó', dead: 0.04, stuck: 0.02, speed: 1.0, time: 1.0, succ: 0, err: 0.02, roll: 0.06, flagOk: 0.95, hpT: 0.75, pen: 0.1 },
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const inRect = (x, y, r) => x >= r[0] && x <= r[1] && y >= r[2] && y <= r[3];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const inFire = (x, y) => ZONES.fire.findIndex(r => inRect(x, y, r));
  const inMountain = (x, y, pad = 0) => MOUNTAINS.findIndex(([cx, cy]) => Math.abs(x - cx) <= M_HALF + pad && Math.abs(y - cy) <= M_HALF + pad);

  // ---- Tính điểm: hàm thuần theo bảng điểm B.4.2, kiểm bằng 3 ví dụ của luật ----
  // s = { fire: {o, g}, mtn: [[{g, o} ×3] ×4], flags: [bool ×4], parks: {red: ['full'|'partial'|null ×2], blue: [...]}, wrongOnMtn }
  function scoreSummary(s) {
    const b = { fire: s.fire.o * 5, r1: 0, r2: 0, r3: 0, flag: 0, park: 0, wrong: 0 };
    let wrong = s.fire.g;
    s.mtn.forEach((tiers, m) => {
      b.r1 += tiers[0].g * 5; b.r2 += tiers[1].g * 10; b.r3 += tiers[2].g * 15;
      wrong += tiers[0].o + tiers[1].o + tiers[2].o;
      if (s.flags[m]) b.flag += tiers.every(t => t.g > 0) ? 40 : 20;
    });
    for (const a of ['red', 'blue']) {
      const p = s.parks[a];
      for (const x of p) b.park += x === 'full' ? 10 : x === 'partial' ? 5 : 0;
      if (p.length === 2 && p.every(x => x === 'full')) b.park += 10;
    }
    b.wrong = -3 * wrong;
    b.total = b.fire + b.r1 + b.r2 + b.r3 + b.flag + b.park + b.wrong;
    return b;
  }
  /** Điểm của một đội: điểm trận − phạt của đội, thấp nhất 0; thẻ đỏ = 0 (B.4.3). */
  const teamScore = (match, pen) => (pen.red ? 0 : Math.max(0, match - 5 * pen.minor - 10 * pen.yellow));

  // ---- Trận đấu ----
  function createMatch(lineup, opts = {}) {
    const R = rng(opts.seed ?? 1);
    const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const balls = [];
    const mtn = MOUNTAINS.map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 })));
    const flags = MOUNTAINS.map(() => null);
    // Hộp Phân Phối ở giữa thành sân phía trên: bóng lăn ra khắp sân, dày ở nửa trên.
    for (let i = 0; i < 300; i++) {
      const c = i < 100 ? 'o' : 'g';
      let x = clamp(1200 + gauss() * 750, 25, F - 25), y = clamp(F - 150 - Math.abs(gauss()) * 1100, 25, F - 25);
      const ball = { c, x, y, st: 'field', by: null };
      const m = inMountain(x, y);
      if (m >= 0) {
        if (R() < 0.25 && mtn[m][0][c] + mtn[m][0][c === 'g' ? 'o' : 'g'] < TIER_CAP[0]) { ball.st = 'mtn'; ball.m = m; ball.tier = 0; mtn[m][0][c]++; }
        else { const [cx, cy] = MOUNTAINS[m]; const a = Math.atan2(y - cy, x - cx); ball.x = cx + Math.cos(a) * 300; ball.y = cy + Math.sin(a) * 300; }
      }
      balls.push(ball);
    }
    const startPos = { red: [[720, 160], [980, 160]], blue: [[1420, 160], [1680, 160]] };
    const robots = lineup.map((d, i) => {
      const alliance = i < 2 ? 'red' : 'blue';
      const T = TYPES[d.type], S = SKILLS[d.skill];
      const [x, y] = startPos[alliance][i % 2];
      return { id: i, team: d.team ?? `Đội ${i + 1}`, alliance, type: d.type, skill: d.skill, T, S, x, y, heading: Math.PI / 2,
        carried: [], hasFlag: true, task: null, busy: 0, parked: null, idle: 0, log: [],
        flagFirst: d.flagFirst ?? opts.flagFirst ?? true, parkLead: d.parkLead ?? opts.parkLead ?? null, tierPolicy: d.tierPolicy ?? opts.tierPolicy ?? 'best' };
    });
    const hp = { red: { o: 0, g: 0, t: 0, busyUntil: 0 }, blue: { o: 0, g: 0, t: 0, busyUntil: 0 } };
    const hpSkill = a => { const rs = robots.filter(r => r.alliance === a); return rs.reduce((s, r) => s + r.S.hpT, 0) / rs.length; };
    const st = { t: -START_S, balls, mtn, flags, robots, hp, events: [], R, done: false, opts };

    const ev = (r, text) => { st.events.push({ t: st.t, r: r?.id ?? null, text }); };
    const free = b => b.st === 'field';
    const mtnCount = (m, tier) => mtn[m][tier].g + mtn[m][tier].o;

    // Đường đi: thẳng, hoặc vòng qua 1 góc núi nếu bị chặn.
    function blocked(ax, ay, bx, by, pad) {
      for (const [cx, cy] of MOUNTAINS) {
        const h = M_HALF + pad;
        for (let k = 0; k <= 20; k++) { const x = ax + (bx - ax) * k / 20, y = ay + (by - ay) * k / 20; if (Math.abs(x - cx) < h && Math.abs(y - cy) < h) return true; }
      }
      return false;
    }
    function route(r, tx, ty) {
      const pad = r.T.w / 2;
      if (!blocked(r.x, r.y, tx, ty, pad - 5)) return [[tx, ty]];
      let best = null;
      for (const [cx, cy] of MOUNTAINS) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const wx = clamp(cx + sx * (M_HALF + pad + 25), pad, F - pad), wy = clamp(cy + sy * (M_HALF + pad + 25), pad, F - pad);
        if (blocked(r.x, r.y, wx, wy, pad - 10) || blocked(wx, wy, tx, ty, pad - 10)) continue;
        const d = Math.hypot(wx - r.x, wy - r.y) + Math.hypot(tx - wx, ty - wy);
        if (!best || d < best.d) best = { d, p: [[wx, wy], [tx, ty]] };
      }
      return best ? best.p : [[tx, ty]];
    }
    const travel = (r, tx, ty) => { const p = route(r, tx, ty); let d = 0, x = r.x, y = r.y; for (const [a, b] of p) { d += Math.hypot(a - x, b - y); x = a; y = b; } return d / (r.T.speed * r.S.speed) + p.length * r.T.turn * r.S.time; };
    const go = (r, kind, tx, ty, extra = {}) => { r.task = { kind, path: route(r, tx, ty), turnLeft: r.T.turn * r.S.time, ...extra }; };

    function mountainApproach(r, m) {
      const [cx, cy] = MOUNTAINS[m], d = M_HALF + r.T.l / 2 + 10;
      const opts = [[cx, cy - d], [cx, cy + d], [cx - d, cy], [cx + d, cy]].filter(([x, y]) => x > r.T.w / 2 && x < F - r.T.w / 2 && y > r.T.w / 2 && y < F - r.T.w / 2 && inMountain(x, y, r.T.w / 2 - 20) < 0);
      opts.sort((a, b) => Math.hypot(a[0] - r.x, a[1] - r.y) - Math.hypot(b[0] - r.x, b[1] - r.y));
      return opts[0] ?? [cx, cy - d];
    }
    function fireTarget(r) {
      let best = null;
      ZONES.fire.forEach((z, i) => { const x = clamp(r.x, z[0] + 150, z[1] - 150), y = clamp(r.y, z[2] + 150, z[3] - 150); const d = Math.hypot(x - r.x, y - r.y); if (!best || d < best.d) best = { d, x, y, i }; });
      return best;
    }
    // Giá trị kỳ vọng của việc thả 1 bóng xanh lên (m, tier) đối với robot r.
    function tierValue(r, m, tier) {
      const p = Math.max(0, (r.T.mtn?.[tier] ?? 0) + r.S.succ);
      if (!p || mtnCount(m, tier) >= TIER_CAP[tier]) return -1;
      let v = TIER_PTS[tier];
      const others = [0, 1, 2].filter(k => k !== tier).every(k => mtn[m][k].g > 0);
      if (mtn[m][tier].g === 0 && others && (flags[m] || (r.hasFlag && r.T.flag))) v += 20; // hoàn thành núi để cờ thành 40
      return v * p;
    }
    function chooseMountain(r) {
      let best = null;
      MOUNTAINS.forEach((_, m) => {
        const tiers = r.tierPolicy === 'low' ? [0] : r.skill === 'easy' ? [0, 1] : r.skill === 'medium' ? [0, 1, 2].filter(k => (r.T.mtn?.[k] ?? 0) >= 0.85 || k < 2) : [0, 1, 2];
        const v = Math.max(...tiers.map(k => tierValue(r, m, k)));
        if (v <= 0) return;
        const [ax, ay] = mountainApproach(r, m);
        const score = r.skill === 'easy' ? -travel(r, ax, ay) + R() * 3 : v / (3 + travel(r, ax, ay));
        if (!best || score > best.score) best = { m, score };
      });
      return best?.m ?? -1;
    }
    function nearestBall(r, filter) {
      let best = null, bd = Infinity;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (!free(b) || !filter(b)) continue;
        if (inFire(b.x, b.y) >= 0 && b.c === 'o') continue; // đã ghi điểm
        if (inRect(b.x, b.y, ZONES.start[r.alliance]) && r.type !== 'maker') continue; // để Human Player nhặt
        if (b.x < r.T.w / 2 - 10 || b.x > F - r.T.w / 2 + 10) { /* sát rào vẫn gom được */ }
        let d = Math.hypot(b.x - r.x, b.y - r.y);
        if (b.c === 'g' && r.skill === 'hard' && inFire(b.x, b.y) >= 0) d -= 700; // gỡ bóng xanh khỏi Khu Chữa Cháy: +3 ngay
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function shouldPark(r) {
      const left = MATCH_S - st.t;
      if (left > ENDGAME_S + 15) return false;
      const z = ZONES.safe[r.alliance], tx = (z[0] + z[1]) / 2, ty = (z[2] + z[3]) / 2;
      const need = travel(r, tx, ty) + 2;
      if (r.parkLead != null) return r.parkLead >= 0 && left <= Math.max(r.parkLead, need + 1);
      if (left > ENDGAME_S) return false; // chỉ được tính điểm trong End Game, robot đi từ trước 30 s cũng được nhưng mất việc
      if (r.skill === 'hard') return left <= need + 3;
      if (r.skill === 'medium') return left <= Math.max(need + 6, 22);
      return r.forgetPark ? false : left <= 15;
    }

    function decide(r) {
      if (r.parked) return;
      const T = r.T, S = r.S;
      if (st.t >= 0 && shouldPark(r)) {
        const z = ZONES.safe[r.alliance];
        const mate = robots.find(o => o !== r && o.alliance === r.alliance && (o.task?.kind === 'park' || o.parked));
        const tx = mate ? (mate.parkX < (z[0] + z[1]) / 2 ? z[1] - T.w / 2 - 4 : z[0] + T.w / 2 + 4) : (z[0] + z[1]) / 2;
        r.parkX = tx;
        return go(r, 'park', tx, (z[2] + z[3]) / 2);
      }
      const g = r.carried.filter(i => balls[i].c === 'g').length, o = r.carried.length - g;
      // 1. Cắm cờ trước (nếu có cơ cấu cờ).
      if (r.hasFlag && T.flag && (r.flagFirst || r.carried.length === 0 && st.t > 60)) {
        let best = -1, bd = Infinity;
        flags.forEach((f, m) => { if (f == null) { const [ax, ay] = mountainApproach(r, m); const d = travel(r, ax, ay) + (r.skill === 'easy' ? R() * 4 : 0); if (d < bd) { bd = d; best = m; } } });
        if (best >= 0) { const [ax, ay] = mountainApproach(r, best); return go(r, 'flag', ax, ay, { m: best }); }
      }
      // 2. Đang chở bóng: đi giao.
      const full = r.carried.length >= T.cap || (T.intake === 'sort' && (g >= T.cap || o >= T.cap));
      const fieldWanted = balls.filter(b => free(b) && !(b.c === 'o' && inFire(b.x, b.y) >= 0)).length;
      const deliverNow = full || (r.carried.length > 0 && (T.intake === 'none' || fieldWanted < 15 || r.idle > 3 || MATCH_S - st.t < ENDGAME_S + 10));
      if (deliverNow) {
        if (r.type === 'ui') { const z = ZONES.start[r.alliance]; return go(r, 'dumpStart', clamp(r.x, z[0] + 120, z[1] - 120), z[3] + T.l / 2 - 60); }
        if (r.type === 'sort' && o >= Math.max(1, g)) { const f = fireTarget(r); return go(r, 'dropFire', f.x, f.y); }
        if (g > 0 && T.mtn) { const m = chooseMountain(r); if (m >= 0) { const [ax, ay] = mountainApproach(r, m); return go(r, 'dropMtn', ax, ay, { m }); } }
        if (o > 0 || g > 0) { const f = fireTarget(r); return go(r, 'dropFire', f.x, f.y); }
      }
      // 3. Nhận bóng ở Khu Tiếp Tế.
      const tray = hp[r.alliance];
      if (T.hpLoad && (T.intake === 'none' || (tray.g >= 4 && r.carried.length === 0 && r.type === 'maker' && r.skill !== 'easy'))) {
        const z = ZONES.load[r.alliance];
        const want = tray.g > 0 || T.intake !== 'none' ? 'g' : 'o';
        return go(r, 'load', (z[0] + z[1]) / 2 + (r.alliance === 'red' ? 40 : -40), z[3] + T.l / 2 - 90, { want });
      }
      // 4. Gom bóng.
      if (T.intake !== 'none') {
        let i;
        if (T.intake === 'select') i = nearestBall(r, b => b.c === 'g' && (r.skill !== 'easy' || inFire(b.x, b.y) < 0)) ?? nearestBall(r, b => b.c === 'o');
        else if (T.intake === 'sort') i = nearestBall(r, b => (b.c === 'g' ? g : o) < T.cap && !(b.c === 'g' && inFire(b.x, b.y) >= 0 && false));
        else i = nearestBall(r, () => true);
        if (i != null) return go(r, 'pick', balls[i].x, balls[i].y, { ball: i });
      }
      r.idle += DT;
      if (r.carried.length) { const f = fireTarget(r); return go(r, 'dropFire', f.x, f.y); }
    }

    function finish(r) {
      const k = r.task.kind, T = r.T, S = r.S;
      if (k === 'pick') {
        const take = (i) => { const b = balls[i]; if (!free(b) || r.carried.length >= T.cap) return; b.st = 'robot'; r.carried.push(i); };
        if (T.intake === 'bulk') {
          balls.forEach((b, i) => { if (free(b) && Math.hypot(b.x - r.x, b.y - r.y) < 190 && !inRect(b.x, b.y, ZONES.start[r.alliance])) take(i); });
        } else {
          take(r.task.ball);
          if (R() < S.err) { const j = nearestBall(r, b => Math.hypot(b.x - r.x, b.y - r.y) < 160); if (j != null) take(j); }
        }
      } else if (k === 'dropFire') {
        const f = fireTarget(r), z = ZONES.fire[f.i];
        const keep = r.carried.filter(i => balls[i].c === 'g' && T.intake !== 'bulk' && r.skill !== 'easy' && T.mtn);
        const drop = r.carried.filter(i => !keep.includes(i));
        for (const i of drop) {
          const b = balls[i]; b.st = 'field'; b.by = r.id;
          b.x = clamp(r.x + (R() - 0.5) * 200, z[0] + 20, z[1] - 20); b.y = clamp(r.y + (R() - 0.5) * 200, z[2] + 20, z[3] - 20);
          if (R() < S.roll + (T.intake === 'bulk' ? 0.1 : 0)) { b.x = clamp(b.x + (b.x < 1200 ? 1 : -1) * (300 + R() * 200), 25, F - 25); b.y = clamp(b.y - 300 - R() * 200, 25, F - 25); }
        }
        ev(r, `thả ${drop.length} bóng vào Khu Chữa Cháy`); r.carried = keep;
      } else if (k === 'dropMtn') {
        const m = r.task.m; let placed = 0, rest = [];
        for (const i of r.carried) {
          const b = balls[i];
          if (b.c === 'o' && r.skill !== 'easy') { rest.push(i); continue; } // người lái tốt giữ bóng cam lại
          const tiers = [0, 1, 2].filter(t => (T.mtn[t] ?? 0) > 0 && mtnCount(m, t) < TIER_CAP[t] && (r.tierPolicy !== 'low' || t === 0)).sort((a, c) => tierValue(r, m, c) - tierValue(r, m, a));
          let t = tiers[0];
          if (t == null) { rest.push(i); continue; }
          if (r.skill === 'easy' && t === 2) t = 1;
          while (t >= 0 && R() > T.mtn[t] + S.succ) t--; // trượt xuống tầng thấp hơn
          if (t >= 0 && mtnCount(m, t) < TIER_CAP[t]) { b.st = 'mtn'; b.m = m; b.tier = t; b.by = r.id; mtn[m][t][b.c]++; placed++; }
          else { const [cx, cy] = MOUNTAINS[m]; const a = R() * Math.PI * 2; b.st = 'field'; b.x = clamp(cx + Math.cos(a) * 280, 25, F - 25); b.y = clamp(cy + Math.sin(a) * 280, 25, F - 25); }
        }
        r.carried = rest; ev(r, `đặt ${placed} Mầm Cây lên Núi ${'ABCD'[m]}`);
      } else if (k === 'flag') {
        const m = r.task.m;
        if (flags[m] != null) return; // đội khác cắm trước
        r.hasFlag = false;
        if (R() < S.flagOk) { flags[m] = r.id; ev(r, `cắm Lá Cờ lên Núi ${'ABCD'[m]}`); }
        else ev(r, `làm rơi Lá Cờ ở Núi ${'ABCD'[m]}`);
      } else if (k === 'dumpStart') {
        const z = ZONES.start[r.alliance];
        for (const i of r.carried) { const b = balls[i]; b.st = 'field'; b.feed = r.id; b.x = clamp(r.x + (R() - 0.5) * 260, z[0] + 20, z[1] - 20); b.y = clamp(z[2] + 40 + R() * 200, z[2] + 20, z[3] - 20); }
        ev(r, `nhả ${r.carried.length} bóng cho Human Player`); r.carried = [];
      } else if (k === 'park') {
        const z = ZONES.safe[r.alliance];
        const fully = [r.x - T.w / 2, r.x + T.w / 2].every(x => x >= z[0] && x <= z[1]) && [r.y - T.l / 2, r.y + T.l / 2].every(y => y >= z[2] && y <= z[3]);
        const mate = robots.find(o => o !== r && o.parked && o.alliance === r.alliance);
        let p = fully ? 'full' : 'partial';
        if (mate && mate.T.w + T.w > 375) p = 'partial'; // hai robot không cùng lọt ô 375
        r.parked = p; ev(r, `về Vùng Bảo Vệ Xanh (${p === 'full' ? 'toàn phần' : 'một phần'})`);
      }
    }

    function actionTime(r) {
      const k = r.task.kind, T = r.T, S = r.S;
      if (k === 'pick') return (T.intake === 'bulk' ? T.pick * 4 : T.pick) * S.time;
      if (k === 'dropFire') return (2 + T.fireDrop * r.carried.length) * S.time;
      if (k === 'dropMtn') return (3 + r.carried.length * (T.mtnDrop?.[1] ?? 1)) * S.time;
      if (k === 'flag') return T.flagT * S.time;
      if (k === 'dumpStart') return 1.2 * S.time;
      if (k === 'park') return 0.5;
      return 0;
    }

    function stepRobot(r) {
      if (r.parked) return;
      if (r.dead) return;
      if (r.busy > 0) { r.busy -= DT; if (r.busy <= 0) { finish(r); r.task = null; } return; }
      if (!r.task) { decide(r); if (!r.task) return; }
      const t = r.task;
      if (t.kind === 'load') return stepLoad(r);
      if (t.kind === 'pick' && !free(balls[t.ball])) { r.task = null; return; }
      if (t.turnLeft > 0) { t.turnLeft -= DT; return; }
      if (st.t >= r.deadAt) { if (!r.dead) { r.dead = true; ev(r, 'trục trặc, đứng yên tới hết trận'); } return; }
      if (R() < r.S.stuck * DT) { t.turnLeft = 3 + R() * 5; return; } // bóng kẹt dưới bánh, phải lùi gỡ
      const [tx, ty] = t.path[0];
      const v = r.T.speed * r.S.speed * DT, d = Math.hypot(tx - r.x, ty - r.y);
      const reach = t.kind === 'pick' ? r.T.l / 2 : 8;
      if (d <= Math.max(v, reach)) {
        if (t.kind !== 'pick') { r.x = tx; r.y = ty; }
        t.path.shift();
        if (t.path.length) { t.turnLeft = r.T.turn * r.S.time; return; }
        r.idle = 0; r.busy = actionTime(r); if (r.busy <= 0) { finish(r); r.task = null; }
        return;
      }
      r.heading = Math.atan2(ty - r.y, tx - r.x);
      r.x += (tx - r.x) / d * v; r.y += (ty - r.y) / d * v;
    }
    function stepLoad(r) {
      const t = r.task;
      if (t.path.length) { // đi tới ô
        const [tx, ty] = t.path[0], v = r.T.speed * r.S.speed * DT, d = Math.hypot(tx - r.x, ty - r.y);
        if (t.turnLeft > 0) { t.turnLeft -= DT; return; }
        if (d <= v) { r.x = tx; r.y = ty; t.path.shift(); t.wait = 0; if (t.path.length) t.turnLeft = r.T.turn * r.S.time; }
        else { r.heading = Math.atan2(ty - r.y, tx - r.x); r.x += (tx - r.x) / d * v; r.y += (ty - r.y) / d * v; }
        return;
      }
      const tray = hp[r.alliance];
      t.wait += DT;
      const room = r.T.cap - r.carried.length;
      const want = tray[t.want] > 0 ? t.want : (tray.g > 0 ? 'g' : tray.o > 0 ? 'o' : null);
      if (room <= 0 || (!want && (t.wait > 4 || r.carried.length >= 3)) || MATCH_S - st.t < 3) { ev(r, `nhận ${r.carried.length} bóng từ Human Player`); r.task = null; return; }
      if (!want || st.t < tray.busyUntil) return;
      // Human Player thả 1 bóng vào robot.
      const idx = balls.findIndex(b => b.st === 'hp' && b.a === r.alliance && b.c === want);
      if (idx < 0) return;
      tray[want]--; balls[idx].st = 'robot'; r.carried.push(idx);
      tray.busyUntil = st.t + 0.8 * hpSkill(r.alliance);
      if (want === 'o' && r.carried.length >= 4 && tray.g === 0) { r.task = null; }
    }
    function stepHP() {
      for (const a of ['red', 'blue']) {
        const tray = hp[a];
        if (st.t < tray.busyUntil) continue;
        const idx = balls.findIndex(b => b.st === 'field' && inRect(b.x, b.y, ZONES.start[a]));
        if (idx < 0) continue;
        const b = balls[idx]; b.st = 'hp'; b.a = a; tray[b.c]++;
        tray.busyUntil = st.t + 0.6 * hpSkill(a);
      }
    }

    function summary() {
      const fire = { o: 0, g: 0 }, by = robots.map(() => 0);
      // Bóng do Xe Ủi gom về cho Human Player: chia đôi công giữa người gom và người ghi.
      const credit = (b, v) => { if (b.feed != null && b.feed !== b.by) { by[b.feed] += v / 2; by[b.by] += v / 2; } else by[b.by] += v; };
      for (const b of balls) if (b.st === 'field' && inFire(b.x, b.y) >= 0) { fire[b.c]++; if (b.by != null) credit(b, b.c === 'o' ? 5 : -3); }
      for (const b of balls) if (b.st === 'mtn' && b.by != null) credit(b, b.c === 'g' ? TIER_PTS[b.tier] : -3);
      const parks = { red: [], blue: [] };
      for (const r of robots) parks[r.alliance].push(r.parked);
      const s = { fire, mtn, flags: flags.map(f => f != null), parks };
      const sc = scoreSummary(s);
      flags.forEach((f, m) => { if (f != null) by[f] += mtn[m].every(t => t.g > 0) ? 40 : 20; });
      for (const r of robots) by[r.id] += r.parked === 'full' ? 10 : r.parked === 'partial' ? 5 : 0;
      return { ...s, score: sc, contrib: by };
    }

    function step() {
      if (st.done) return;
      st.t += DT;
      if (st.t < 0) return; // 10 giây khởi động: robot đứng yên
      stepHP();
      for (const r of robots) stepRobot(r);
      if (st.t >= MATCH_S - 1e-9) {
        st.done = true;
        const sum = summary();
        const pens = robots.map(r => { const p = { minor: 0, yellow: 0, red: false }; let L = Math.exp(-r.S.pen), k = 0, q = 1; do { k++; q *= R(); } while (q > L); p.minor = k - 1; p.yellow = R() < r.S.pen / 8 ? 1 : 0; p.red = R() < r.S.pen / 40; return p; });
        st.result = { ...sum, pens, teams: robots.map((r, i) => ({ team: r.team, type: r.type, skill: r.skill, alliance: r.alliance, score: teamScore(sum.score.total, pens[i]), contrib: sum.contrib[i] })) };
      }
    }
    for (const r of robots) { r.forgetPark = r.skill === 'easy' && R() < 0.35; r.deadAt = R() < r.S.dead ? R() * MATCH_S : Infinity; }
    st.step = step;
    st.summary = summary;
    return st;
  }

  function runMatch(lineup, opts) { const m = createMatch(lineup, opts); while (!m.done) m.step(); return m.result; }

  const api = { F, ZONES, MOUNTAINS, M_HALF, TIER_CAP, TYPES, SKILLS, MATCH_S, START_S, ENDGAME_S, DT, rng, scoreSummary, teamScore, createMatch, runMatch, inFire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FanrocSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
