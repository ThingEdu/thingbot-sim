// Kiểm kịch bản scripts/event-201.sh: DRY_RUN không chạm mạng; push/start cần xác nhận.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'event-201.sh');
const NET = ['ssh', 'rsync', 'scp', 'ping', 'curl', 'nc', 'npm'];

// Thư mục lệnh giả: mọi lệnh mạng ghi dấu rồi thoát 99.
function shims() {
  const dir = mkdtempSync(join(tmpdir(), 'ev201-'));
  const marker = join(dir, 'CALLED');
  for (const n of NET) {
    const p = join(dir, n);
    writeFileSync(p, `#!/bin/sh\necho "${n} $*" >> "${marker}"\nexit 99\n`);
    chmodSync(p, 0o755);
  }
  return { dir, marker };
}

function run(args: string[], env: Record<string, string>) {
  const s = shims();
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: `${s.dir}:${process.env.PATH}`, HOME: s.dir, ...env },
  });
  const called = existsSync(s.marker);
  rmSync(s.dir, { recursive: true, force: true });
  return { ...r, called, out: `${r.stdout}${r.stderr}` };
}

for (const cmd of ['build', 'push', 'start', 'stop', 'status']) {
  test(`DRY_RUN ${cmd}: in lệnh, không gọi ssh/rsync/npm`, () => {
    const r = run([cmd, '--yes'], { DRY_RUN: '1' });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.called, false, 'DRY_RUN không được chạy lệnh mạng');
    assert.match(r.out, /\[DRY_RUN\]/);
  });
}

test('DRY_RUN push: rsync --delete chỉ vào thư mục site/ con', () => {
  const r = run(['push', '--yes'], { DRY_RUN: '1' });
  assert.match(r.out, /rsync .*--delete/);
  assert.match(r.out, /192\.168\.1\.201:fanroc-game\/site\//);
});

for (const cmd of ['push', 'start']) {
  test(`${cmd} không xác nhận: thoát khác 0, in checklist + nhắc lưới núi, không chạm mạng`, () => {
    for (const dry of ['1', '']) {
      const r = run([cmd], { DRY_RUN: dry });
      assert.notEqual(r.status, 0);
      assert.equal(r.called, false);
      assert.match(r.out, /mountain-mesh\.json/);
      assert.match(r.out, /CHECKLIST/);
    }
  });
}

test('CONFIRM=yes thay được --yes', () => {
  const r = run(['start'], { DRY_RUN: '1', CONFIRM: 'yes' });
  assert.equal(r.status, 0, r.out);
});

test('từ chối DIR/HOST/PORT nguy hiểm', () => {
  const bad: Record<string, string>[] = [{ DIR: '' }, { DIR: '/' }, { DIR: '~' }, { DIR: '.' }, { DIR: '../x' }, { DIR: '/etc' }, { HOST: '' }, { HOST: '-v' }, { HOST: '-oProxyCommand=x' }, { HOST: 'a b' }, { SSH_USER: '-oProxyCommand=x' }, { SSH_USER: '-l' }, { PORT: '80' }, { PORT: 'abc' }];
  for (const env of bad) {
    const r = run(['push', '--yes'], { DRY_RUN: '1', ...env });
    assert.notEqual(r.status, 0, JSON.stringify(env));
    assert.equal(r.called, false);
  }
});

test('DRY_RUN không in dòng thành công như đã làm xong', () => {
  const r = run(['push', '--yes'], { DRY_RUN: '1' });
  assert.doesNotMatch(r.out, /^event-201: đã đẩy/m);
});
