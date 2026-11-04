/**
 * Trang ThingBot FanRoc Game: vỏ giao diện kiểu VS Code (ui/shell.ts) quanh sân 3D và các màn của game (ui/router.ts):
 * màn chính kiểu game (ui/home.ts, mở trang là vào đây), Trước trận (chọn robot như chọn đội), Trận lẻ / Đấu tập, Xưởng
 * lập trình (ui/workshop.ts), Nhiệm vụ con rùa (ui/missions.ts: danh sách ①, làm nhiệm vụ ② có vệt, số đo, chấm ⭐);
 * Giải đấu (ui/tournament.ts: ghi danh, thử phím, lịch, Pit, trận có người chơi ở màn 'tmatch', trận máy chạy ngầm bằng
 * playAgents, Xem nhanh ở màn 'treplay', bục trao giải; chỉ ghi kết quả khi trận đấu xong). `go(screen, arg?)` đổi màn và dựng lại phiên chơi (GameSession, game.ts) của màn
 * đó; trang chỉ khởi tạo, nối nút và vẽ. Vệt robot chỉ có ở màn ② (`scene.trail`; màn khác xoá vệt).
 *
 * Người chơi và ghế: bạn 1 (và bạn 2 khi "Hai bạn chơi") mỗi bạn một thẻ khối (editors tab 0 / 1), một bo ThingBot ảo,
 * một tay PS2 ảo = tay cầm thật thứ p (R26) gộp với bàn phím (`mergePad`; một bạn dùng cả bàn phím, hai bạn chia đôi).
 * Ghế theo thứ tự [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1]; robot của bạn 1 ngồi ô trái của liên minh bạn chọn, bạn 2 ô trái liên
 * minh kia, ghế còn lại là máy (ui/settings.ts `defaultSeats`). ⚙ › Nâng cao chọn tay ai lái từng ghế (R27).
 * Trận lẻ / Đấu tập: robot của em chạy chương trình đã lưu ở Xưởng ("Của em vN") hoặc Mặc định (TeleOp mẫu); chương
 * trình nạp sẵn lúc vào trận, chạy khi hết 10 s xả bóng (Đấu tập: chạy ngay). Có chương trình khối thì tốc độ ×1 (R24).
 *
 * Bàn phím không lái khi đang gõ (ô nhập / ô số của khối — `typing`), và nhả hết phím khi cửa sổ mất tiêu điểm hoặc
 * bị ẩn (Review Focus 1). `window.__fanroc` mở cho kiểm thử trình duyệt (ruling R4).
 */
import { GameSession, type Driver, type SeatSpec } from './game.ts'
import type { Skill } from './agent.ts'
import { RobotLink, type LinkState } from './link.ts'
import type { RobotConfig } from './robots.ts'
import { PadSeats, PS2_NEUTRAL, type SeatStatus } from './gamepad.ts'
import { KeyPad, layoutFor, mergePad, typing } from './keys.ts'
import { effectiveSpeed } from './pace.ts'
import { configControls, createEditors, workerCount } from './editor.ts'
import { defaultConfig, sample, TOOLBOX } from './programs.ts'
import { NEUTRAL } from './ports.ts'
import { MISSION_SEED, MISSIONS } from './missions/data.ts'
import { grade, loopEmpty, restWaits } from './missions/grade.ts'
import { MissionRun, type RunView } from './missions/run.ts'
import type { Mission } from './missions/types.ts'
import { PHYSICS_DT } from './world.ts'
import { createScene, defaultQuality, type CameraView, type Quality } from './view/scene.ts'
import { createHud, deadZoneLines } from './view/hud.ts'
import { countdownCue, createScoreboard, programLabel, resultView, ScoreTicker } from './ui/scoreboard.ts'
import { createSound } from './ui/sound.ts'
import { createStore } from './store.ts'
import { FANROC_2026 } from './season.ts'
import { createShell, highlightCpp, serialNews, serialPatch, type InputKind, type SerialMark } from './ui/shell.ts'
import { chrome, defaultCamera, type Screen } from './ui/router.ts'
import { createHome, createPick, createPlaceholder, programText, robotName, type HomeInfo, type TileId } from './ui/home.ts'
import { assignSeat, createSettings, defaultSeats, playerSeat, seatOf, seatOptions, type SeatMode, type SettingsCtx } from './ui/settings.ts'
import { createWorkshopBar, Drafts, resetVerified, saveVerified, sameProgram } from './ui/workshop.ts'
import { createRobotCards, type CardInfo } from './ui/robotcard.ts'
import { penaltyPoints, playAgents } from './quickmatch.ts'
import { nextMatch, record, type Played, type TournamentState } from './tournament.ts'
import {
  createTournamentScreen, matchSeed, newTournament, pendingMachines, played, playersIn, progressText, SAVE_TOUR_FAILED,
  saveTournamentVerified, seatIds, standingRows, type PitView,
} from './ui/tournament.ts'
import { createMissionHud, createMissionList, mergeProgress, missionCards, pendingGoals, renderSideList, saveMissionVerified, totalStars } from './ui/missions.ts'

const shell = createShell(document.querySelector<HTMLElement>('#app')!)
const stage = shell.stage

/** Tên đội của 4 ghế khi ghế đó là máy (ghế người chơi mang tên bạn đó). */
const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const ALLIANCE_SEAT = ['Đỏ', 'Xanh', 'Đỏ', 'Xanh']
/** Số bước vật lý tối đa mỗi khung ở tốc độ ×1 (nhân theo tốc độ xem). */
const MAX_STEPS = 4
/** Ngân sách thời gian chạy vật lý mỗi khung, ms. */
const STEP_BUDGET_MS = 45
const SPEEDS = [1, 4, 40]
const CAMERAS: CameraView[] = ['field', 'follow', 'driver']
const PLAYERS = [0, 1] as const
type Player = 0 | 1
/** Tham số của `go`: bạn nào (Xưởng), nhiệm vụ nào, Xưởng mở từ Pit của giải. */
type GoArg = { player?: Player; id?: string; returnTo?: 'tournament' }
/** Thẻ thử thách tự tích ✓ trong lúc chạy: chấm thử tối đa chừng này lần mỗi giây (đếm bóng tốn). */
const PREVIEW_HZ = 4
/** Trận máy chạy ngầm: mỗi lát chừng này ms rồi nhường cho khung hình / nút bấm. */
const MACHINE_SLICE_MS = 24
/** Lưu chương trình đang làm của nhiệm vụ sau khi vùng khối thôi đổi chừng này ms. */
const MISSION_SAVE_MS = 1000

const CSS = `
.sh-serial { margin: 0; white-space: pre-wrap; word-break: break-all; font: inherit; color: #d4d4d4; }
.sh-serial:empty::before { content: 'Chưa có dòng Serial nào. Khối "Serial in" của chương trình in ra ở đây.'; color: #858585; font-family: var(--font); }
.sh-code-warn { margin: 8px 10px 0; padding: 6px 8px; border-radius: 6px; background: rgba(240, 170, 30, 0.18); color: #f0c674; font-size: 12.5px; line-height: 1.45; }
.sh-code-note { padding: 6px 10px 0; font-size: 12px; color: #969696; }
`

async function start(): Promise<void> {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const store = createStore(FANROC_2026.id)
  const settings = store.settings()
  const profile = store.profile()
  const names = profile.names
  const saveSettings = () => store.saveSettings(settings)

  const editors = createEditors(
    shell.side.blocks,
    PLAYERS.map((p) => ({ label: `${names[p]} · robot của em`, cfg: p === 0 ? settings.robot : settings.robot2 })),
  )
  const cfgOf = (p: Player): RobotConfig => editors.cfg(p)
  const players = (): 1 | 2 => (settings.layout2p ? 2 : 1)
  const seats = new PadSeats()

  // ---------- Trạng thái màn ----------
  let screen: Screen = 'home'
  let seed = 1
  /** Robot của em chạy bản đã lưu ở Xưởng (khi có) hay Mặc định (⚙ / Trước trận). */
  let runMine = true
  /** Trước trận: Trận lẻ hay Đấu tập. */
  let pickPractice = false
  let pickPlayer: Player = 0
  /** Xưởng: chương trình của bạn nào. */
  let wsPlayer: Player = 0
  /** Màn ②: nhiệm vụ đang làm; lần chạy từ ▶ (null: chưa chạy / vừa Về chỗ cũ). */
  let mission: Mission | null = null
  let mrun: MissionRun | null = null
  /** «lặp mãi» của chương trình lúc ▶ rỗng (R95). */
  let mEmptyLoop = true
  /** Nhiệm vụ trận (nhiệm vụ 12): đang chơi ở màn Trận lẻ với robot máy mức Dễ, chấm khi hết giờ. */
  let matchMission: Mission | null = null
  /** Ai lái từng ghế ở trận lẻ / đấu tập (R27); vào trận ⇒ về mặc định theo liên minh / mức máy / số bạn. */
  let modes: SeatMode[] = defaultSeats(settings.alliance, settings.skill, players())
  // ---------- Giải đấu ----------
  const loadedTour = store.tournament()
  /** Giải đang có (dở hoặc đã xong); null = chưa có / vừa bỏ. */
  let tour: TournamentState | null = loadedTour === 'corrupt' ? null : loadedTour
  /** Giải lưu trong trình duyệt bị hỏng (màn chính báo, màn giải đấu mời Giải mới). */
  let tourCorrupt = loadedTour === 'corrupt'
  /** Trận của giải đang chơi ('tmatch') hay đang Xem nhanh ('treplay'). */
  let tourIndex = -1
  /** Ghi danh: số bạn, số trận mỗi đội. */
  const reg = { players: players() as 1 | 2, perTeam: 4 }
  /** Lần lưu giải gần nhất không đọc lại được (bộ nhớ chặn / đầy). */
  let tourSaveFailed = false
  /** Dòng báo ở Pit (vừa lưu chương trình ở Xưởng…), xoá khi rời Pit. */
  let tourNote: { text: string; ok: boolean } | null = null
  /** Đổi giải (Giải mới) ⇒ trận máy đang chạy ngầm của giải cũ bỏ kết quả. */
  let tourToken = 0
  /** Đang chạy ngầm trận máy (đặt trước khi chạy: vẽ Pit trong lúc chạy không khởi động thêm lần nữa). */
  let machineRun = false
  let machineBusy: string | null = null
  /** Phép thử trình duyệt đặt seed bốc thăm (`__fanroc.setTournamentSeed`). */
  let tourSeed: number | null = null
  /** Xưởng mở từ Pit: lưu xong quay lại Pit, robot giữ như lúc ghi danh. */
  let wsReturn: 'tournament' | null = null
  /** Đội của bạn p trong giải. */
  const tourEntrant = (p: Player) => tour?.entrants.find((e) => e.kind === 'player' && e.player === p) ?? null
  /** Ghế của bạn p ở trận giải đang chơi (−1: bạn đó không đấu trận này). */
  const tourSeat = (p: Player): number => {
    if (screen !== 'tmatch' || !tour || tourIndex < 0) return -1
    return playersIn(tour, tourIndex).find((x) => x.player === p)?.seat ?? -1
  }
  /** Nhãn chương trình của bạn p trong giải: bản lưu ở Xưởng cho robot của giải, không thì Mặc định (Review Focus 5). */
  const tourLabel = (p: Player) => {
    const e = tourEntrant(p)
    return programText(e ? store.program(p, e.robot) : null)
  }
  const tourProgram = (p: Player) => {
    const e = tourEntrant(p)
    const cfg = e?.robot ?? cfgOf(p)
    return store.program(p, cfg)?.state ?? sample(cfg, 'teleop')
  }

  const followers: ({ link: ReturnType<typeof editors.follow>['link']; dispose(): void } | null)[] = [null, null, null, null]
  /** Bo ảo không chương trình: ghế đứng yên (Xưởng: sân chỉ có robot của em chạy thử). */
  const idle = [0, 1, 2, 3].map(() => new RobotLink(() => {}))
  /** Tay PS2 ảo từ bàn phím của từng bạn (một bạn: cả bàn phím; hai bạn: nửa trái / nửa phải). */
  let keypads: KeyPad[] = []
  const makePads = () => {
    keypads.forEach((k) => k.releaseAll())
    keypads = PLAYERS.slice(0, players()).map((p) => new KeyPad(layoutFor(p, players() === 2)))
  }
  makePads()

  const saved = (p: Player, cfg = cfgOf(p)) => store.program(p, cfg)
  /** Nhãn chương trình robot bạn p đang chạy ở trận ("Của em vN" / "Mặc định"). */
  const label = (p: Player) => programText(saved(p), runMine)
  const programFor = (p: Player) => {
    const rec = saved(p)
    return rec && runMine ? rec.state : sample(cfgOf(p), 'teleop')
  }
  const isMatch = () => screen === 'match' || screen === 'practice'
  /** Ghế của bạn p ở màn này (−1: bạn đó không lái robot nào). */
  const seatOfPlayer = (p: Player): number => {
    if (screen === 'workshop') return p === wsPlayer ? seatOf(p, settings.alliance) : -1
    if (screen === 'mission') return p === 0 ? 0 : -1
    if (screen === 'tmatch') return tourSeat(p)
    return isMatch() ? playerSeat(modes, p) : -1
  }
  /** Ghế camera "Theo robot" bám theo: robot của bạn đang mở thẻ khối, không có thì Robot 1. */
  const mySeat = () => Math.max(0, seatOfPlayer(editors.active as Player))

  const modeOwner = (m: SeatMode): Player | null => (m.startsWith('player-') || m.startsWith('copy-') ? (Number(m.slice(-1)) as Player) : null)
  const seatCfg = (i: number): RobotConfig => {
    const p = modeOwner(modes[i])
    return p === null ? defaultConfig('maker') : cfgOf(p)
  }
  const seatDriver = (i: number): Driver => {
    const m = modes[i]
    if (m.startsWith('player-')) return { kind: 'program', link: editors.link(Number(m.slice(-1))) }
    const f = followers[i]
    if (m.startsWith('copy-') && f) return { kind: 'program', link: f.link }
    return { kind: 'agent', skill: m.startsWith('agent-') ? (m.slice(6) as Skill) : settings.skill }
  }
  const seatTeam = (i: number): string => {
    const m = modes[i]
    return m.startsWith('player-') ? names[Number(m.slice(-1))] : TEAMS[i]
  }

  /** Tên đội từng ghế của phiên đang chạy (bảng điểm: một lần tally mỗi nhịp). */
  let teamNames = TEAMS.slice()
  const newGame = (s: number): Promise<GameSession> => {
    let mode: 'match' | 'practice' = 'practice'
    let list: SeatSpec[]
    let balls = true
    if (screen === 'mission' && mission) {
      // Một robot (ghế 0, R61) ở chỗ xuất phát của nhiệm vụ, sân cố định (R96), có bóng hay không theo nhiệm vụ.
      teamNames = [names[0]]
      const seats = [{ cfg: mission.robot, team: names[0], driver: { kind: 'program', link: editors.link(0) } as Driver }]
      return GameSession.create({ mode: 'mission', seed: MISSION_SEED, seats, balls: mission.balls, start: mission.start })
    }
    if ((screen === 'tmatch' || screen === 'treplay') && tour && tourIndex >= 0) {
      // Trận của giải: đội theo lịch bốc thăm (ghế SEATS), bạn lái robot của mình bằng chương trình khối, đội máy là
      // agent; Xem nhanh: cả 4 là agent (trận máy). Sân theo seed của trận (đấu lại / Xem nhanh cùng sân).
      const t = tour
      list = seatIds(t.schedule[tourIndex]).map((id) => {
        const e = t.entrants.find((x) => x.id === id)!
        const driver: Driver =
          e.kind === 'player' && screen === 'tmatch' ? { kind: 'program', link: editors.link(e.player ?? 0) } : { kind: 'agent', skill: e.skill ?? 'medium' }
        return { cfg: e.robot, team: e.name, driver }
      })
      teamNames = list.map((x) => x.team)
      return GameSession.create({ mode: 'match', seed: matchSeed(t, tourIndex), seats: list })
    }
    if (isMatch()) {
      mode = screen === 'practice' ? 'practice' : 'match'
      list = [0, 1, 2, 3].map((i) => ({ cfg: seatCfg(i), team: seatTeam(i), driver: seatDriver(i) }))
    } else if (screen === 'workshop') {
      // Sân Đấu tập trống bóng, chỉ robot của em chạy (ghế khác đứng yên).
      balls = false
      const mine = seatOf(wsPlayer, settings.alliance)
      list = [0, 1, 2, 3].map((i) =>
        i === mine
          ? { cfg: cfgOf(wsPlayer), team: names[wsPlayer], driver: { kind: 'program', link: editors.link(wsPlayer) } }
          : { cfg: defaultConfig('maker'), team: TEAMS[i], driver: { kind: 'program', link: idle[i] } },
      )
    } else {
      // Màn chính / màn chờ: nền là 4 robot máy chơi luyện tập trên sân.
      list = [0, 1, 2, 3].map((i) => ({ cfg: defaultConfig('maker'), team: TEAMS[i], driver: { kind: 'agent', skill: 'medium' } }))
    }
    teamNames = list.map((x) => x.team)
    return GameSession.create({ mode, seed: s, seats: list, balls })
  }

  let game = await newGame(seed)
  stage.querySelector('.sh-loading')?.remove()
  const scene = createScene(stage)
  let q: Quality = settings.quality ?? defaultQuality()
  scene.quality(q)
  const hud = createHud(shell.panel.events)
  const board = createScoreboard(stage)
  const cards = createRobotCards(stage)
  const ticker = new ScoreTicker()
  const sound = createSound(() => settings.sound)
  const popover = createSettings()

  /** Nhãn chương trình từng ghế trên bảng điểm. */
  const programs = () =>
    game.robots.map((_, i) => {
      if (screen === 'tmatch') {
        const p = PLAYERS.find((x) => tourSeat(x) === i)
        return p === undefined ? programLabel(game.driver(i)) : tourLabel(p)
      }
      if (!isMatch()) return programLabel(game.driver(i))
      const m = modes[i]
      const p = modeOwner(m)
      if (p !== null) return m.startsWith('copy-') ? `Chương trình của ${names[p]}` : label(p)
      return programLabel(game.driver(i))
    })
  editors.setGate(
    () => game.canRun,
    () =>
      game.paused ? 'Đang tạm dừng — bấm Chạy để chạy tiếp' : game.match.phase === 'end' ? 'Trận đã kết thúc — bấm Về chỗ cũ để chơi trận mới' : 'Đã nạp, chờ hết 10 giây xả bóng…',
  )
  editors.onError((i, msg) => hud.log(`${names[i]}: ${msg}`))
  const showTabs = () =>
    editors.tabs(
      PLAYERS.map((p) => {
        // Xưởng: chỉ thẻ của bạn đang sửa (Chạy / Lưu cùng tác động lên một chương trình).
        if (screen === 'mission') return p === 0 && mission ? `${names[0]} · Nhiệm vụ ${mission.n}` : null
        if (screen === 'tmatch') return tourSeat(p) >= 0 ? `${names[p]} · ${robotName(cfgOf(p))}` : null
        const used = screen === 'workshop' ? p === wsPlayer : p === 0 || players() === 2 || modes.some((m) => modeOwner(m) === p)
        return used ? `${names[p]} · ${robotName(cfgOf(p))}` : null
      }),
    )
  showTabs()

  // Khung bên "Khối": vẽ lại vùng khối mỗi khi khung đổi cỡ (mở, đóng, kéo mép).
  new ResizeObserver(() => editors.resize()).observe(shell.side.blocks)

  // Khung bên "Mã Arduino": chỉ xem, sinh lại (chờ 250 ms) khi vùng khối đổi hoặc đổi thẻ (R37 như cũ).
  const codeNote = Object.assign(document.createElement('div'), { className: 'sh-code-note' })
  const codeWarn = Object.assign(document.createElement('div'), { className: 'sh-code-warn' })
  codeWarn.setAttribute('role', 'status')
  const codeView = Object.assign(document.createElement('pre'), { className: 'sh-code-view' })
  codeView.setAttribute('aria-label', 'Mã Arduino sinh từ khối')
  shell.side.code.append(codeNote, codeWarn, codeView)
  let codeTimer = 0
  const showCode = () => {
    const i = editors.active
    const { code, warning } = editors.arduino(i)
    codeNote.textContent = `${names[i]} · mã C++ sinh từ khối, chỉ xem`
    codeWarn.hidden = !warning
    codeWarn.textContent = warning ?? ''
    codeView.innerHTML = highlightCpp(code)
  }
  editors.onChange(() => {
    clearTimeout(codeTimer)
    codeTimer = window.setTimeout(showCode, 250)
  })
  showCode()

  // Khung đáy "Serial": như Task 11 (đếm dòng bằng bộ đếm của RobotLink, chỉ vẽ phần thêm).
  const serialPre = Object.assign(document.createElement('pre'), { className: 'sh-serial' })
  shell.panel.serial.append(serialPre)
  const markOf = (l: RobotLink): SerialMark => ({ loads: l.loads, chars: l.serialChars, lines: l.serialLines, len: l.serial.length })
  let serialOf = -1
  let counted: SerialMark | null = null
  let drawn: SerialMark | null = null
  let serialUnseen = 0
  const showSerial = () => {
    const i = editors.active
    const link = editors.link(i)
    const m = markOf(link)
    if (i !== serialOf) {
      serialOf = i
      serialUnseen = 0
      drawn = null
    } else if (counted && shell.panelTab !== 'serial') serialUnseen += serialNews(counted, m)
    counted = m
    if (shell.panelTab === 'serial') {
      serialUnseen = 0
      const patch = serialPatch(drawn, m)
      if (patch !== 'same') {
        const body = shell.panel.serial
        const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4
        const text = serialPre.firstChild as Text | null
        if (patch === 'full' || !text) serialPre.textContent = link.serial
        else text.appendData(link.serial.slice(-patch))
        if (atEnd) body.scrollTop = 1e9
        drawn = m
      }
    }
    shell.badge('serial', serialUnseen)
  }

  // ---------- Tốc độ (R24) ----------
  let requested = 1
  const speedNow = () => effectiveSpeed(requested, editors.anyActive())
  const setSpeed = (s: number) => {
    requested = Math.max(0, s)
    popover.update()
    return speedNow()
  }

  // ---------- Camera ----------
  let cam: CameraView = 'orbit'
  const setCamera = (v: CameraView) => {
    cam = v
    scene.camera(v, mySeat())
  }

  const expose = () => {
    ;(window as unknown as { __fanroc: unknown }).__fanroc = {
      world: game.world, robots: game.robots, match: game.match, humans: game.humans, setSpeed, editors, session: game, shell, store,
      go: (s: Screen, arg?: GoArg) => go(s, arg),
      /** Giải đấu: trạng thái, ghế của từng bạn ở trận giải đang chơi, đặt seed bốc thăm cho phép thử. */
      tour: {
        get state() {
          return tour
        },
        get view() {
          return tScreen.view
        },
        get index() {
          return tourIndex
        },
        seat: (p: Player) => tourSeat(p),
        busy: () => machineBusy,
      },
      setTournamentSeed: (n: number | null) => void (tourSeed = n),
      get screen() {
        return screen
      },
      /** Vệt của lần chạy nhiệm vụ (chỉ màn ②; màn khác null — không có vệt ngoài nhiệm vụ). */
      get trail() {
        return screen === 'mission' ? (mrun?.trail ?? null) : null
      },
      /** Số hình vệt / đường gợi ý đang vẽ trên sân. */
      get trailObjects() {
        return scene.trailObjects
      },
      /** Nhiệm vụ đang làm và kết quả chấm của lần chạy (null: chưa chấm). */
      get mission() {
        return screen === 'mission' && mission ? { id: mission.id, result: mrun?.result ?? null, reason: mrun?.reason ?? null } : null
      },
      mySeat, keypads: () => keypads, workers: workerCount,
      pause: () => setPaused(true), resume: () => setPaused(false), stepBlock: () => stepBlock(),
      pose: (i: number) => {
        const p = game.robots[i].pose
        return { x: p.x, z: p.z, yaw: p.yaw }
      },
    }
  }

  /**
   * Dựng lại phiên của màn hiện tại (vào màn, Về chỗ cũ, đổi robot / ghế / chế độ): mọi chương trình dừng, robot về ô
   * xuất phát; trận lẻ / đấu tập nạp lại chương trình của các bạn đang lái (chạy khi cổng mở). Chỉ một lần dựng chạy
   * một lúc; yêu cầu đến giữa chừng dồn thành một lần dựng lại ngay sau đó.
   */
  let restarting: Promise<void> | null = null
  let restartAgain = false
  const restart = (): Promise<void> => {
    if (restarting) {
      restartAgain = true
      return restarting
    }
    restarting = (async () => {
      try {
        do {
          restartAgain = false
          editors.stopAll()
          const old = game
          game = await newGame(++seed)
          old.dispose()
          board.hideResult()
          board.clearFx()
          if (isMatch()) {
            for (const p of PLAYERS) if (playerSeat(modes, p) >= 0) editors.run(p)
            game.match.log(
              screen === 'practice'
                ? 'Đấu tập: không xả bóng, không hết giờ — robot của em chạy ngay'
                : 'Trận mới: robot của em chạy chương trình khi hết 10 giây xả bóng',
            )
            if (matchMission && screen === 'match') game.match.log(`Nhiệm vụ ${matchMission.n} · ${matchMission.title}: chơi hết trận cùng ba robot máy mức Dễ`)
          }
          if (screen === 'tmatch' && tour) {
            for (const p of PLAYERS) if (tourSeat(p) >= 0) editors.run(p)
            game.match.log(`Giải đấu · trận ${tourIndex + 1}/${tour.schedule.length}: robot của em chạy chương trình khi hết 10 giây xả bóng`)
          }
          if (screen === 'treplay') game.match.log(`Xem nhanh trận ${tourIndex + 1} (×40) — kết quả đã ghi không đổi`)
          if (screen === 'mission') missionReady()
          expose()
          scene.camera(cam, mySeat())
        } while (restartAgain)
      } finally {
        restarting = null
      }
    })()
    return restarting
  }

  // ---------- Ghế (Nâng cao, R27) ----------
  const syncFollowers = () => {
    modes.forEach((m, i) => {
      const want = m.startsWith('copy-') ? Number(m.slice(-1)) : -1
      const f = followers[i] as ({ src?: number } & NonNullable<(typeof followers)[number]>) | null
      if (f && f.src === want) return
      f?.dispose()
      followers[i] = want < 0 ? null : Object.assign(editors.follow(want, (msg) => hud.log(`Robot ${i + 1}: ${msg}`)), { src: want })
    })
  }
  const clearFollowers = () => {
    followers.forEach((f, i) => {
      f?.dispose()
      followers[i] = null
    })
  }
  const setMode = (i: number, m: SeatMode) => {
    const before = modes
    modes = assignSeat(modes, i, m, settings.skill)
    syncFollowers()
    // Bạn không còn lái ghế nào ⇒ chương trình của bạn đó dừng (không khoá tốc độ, không chạy ngầm).
    for (const p of PLAYERS) if (playerSeat(before, p) >= 0 && playerSeat(modes, p) < 0) editors.stop(p)
    showTabs()
    if (modes.some((_, k) => JSON.stringify(seatCfg(k)) !== JSON.stringify(game.cfgs[k]))) return void restart()
    modes.forEach((x, k) => {
      if (x !== before[k] || k === i) game.setDriver(k, seatDriver(k))
    })
  }

  // ---------- Tạm dừng / từng khối (spec §6.1b) ----------
  const setPaused = (p: boolean) => {
    if (p) game.pause()
    else game.resume()
  }
  const stepBlock = () => game.stepBlock()

  const handlers = {
    run() {
      if (game.paused) return setPaused(false)
      if (screen === 'mission') return void startMission()
      const p = editors.active as Player
      editors.run(p)
      // Trận lẻ: bạn đó chưa lái robot nào ⇒ ngồi ô của mình (thấy ngay ở ⚙ › Nâng cao).
      if (isMatch() && playerSeat(modes, p) < 0) {
        setMode(seatOf(p, settings.alliance), `player-${p}`)
        game.match.log(`${names[p]}: lái robot bằng chương trình khối`)
      }
    },
    pause: () => setPaused(true),
    step: () => void stepBlock(),
    stop: () => {
      if (screen === 'mission') pressMission() // Dừng giữa lần chạy nhiệm vụ = bấm Chấm (R57 b)
      editors.stop(editors.active)
    },
    // Trận giải đã ghi kết quả thì không đấu lại (về Pit); chưa xong thì đấu lại từ đầu.
    reset: () => void (screen === 'tmatch' && tour && nextMatch(tour) !== tourIndex ? go('tournament') : restart()),
    download: () => editors.download(editors.active),
    camera() {
      const k = CAMERAS.indexOf(cam)
      setCamera(CAMERAS[(k + 1) % CAMERAS.length])
    },
  }

  // ---------- Màn chính, Trước trận, màn chờ ----------
  const homeInfo = (): HomeInfo => ({
    season: FANROC_2026.name,
    robot: robotName(cfgOf(0)),
    program: label(0),
    player: names[0],
    stars: totalStars(store),
    missions: { done: MISSIONS.filter((m) => store.mission(m.id).done).length, total: MISSIONS.length },
    tournament: tourCorrupt ? { text: 'Không đọc được giải đang dở', corrupt: true } : tour ? { text: progressText(tour), corrupt: false } : null,
  })
  const overlay = document.body
  const home = createHome(overlay, {
    open: (t: TileId) => {
      if (t === 'match') {
        home.hide()
        pickPlayer = 0
        pickMsg = null
        pick.show()
      } else void go(t === 'workshop' ? 'workshop' : t === 'missions' ? 'missions' : 'tournament')
    },
    settings: () => popover.toggle(settingsCtx()),
  })
  const pick = createPick(
    overlay,
    () => ({
      practice: pickPractice, players: players(), player: pickPlayer, names, cfg: cfgOf,
      saved: (p, cfg) => saved(p, cfg)?.version ?? null,
      alliance: settings.alliance, skill: settings.skill, runMine,
      draft: (p, cfg) => drafts.has(p, cfg),
      draftMsg: pickMsg,
    }),
    {
      saveDraft(p, cfg) {
        const d = drafts.get(p, cfg)
        if (!d) return
        const r = saveVerified(store, p, cfg, d.state)
        if (r.ok) drafts.drop(p, cfg)
        pickMsg = r
        pick.render()
      },
      dropDraft(p, cfg) {
        drafts.drop(p, cfg)
        pickMsg = { text: 'Đã bỏ bản đang sửa — robot của em chạy bản đã lưu', ok: true }
        pick.render()
      },
      setPlayer: (p) => ((pickPlayer = p), pick.render()),
      setCfg: (p, cfg) => (editors.setConfig(p, cfg), pick.render()),
      setPractice: (v) => ((pickPractice = v), pick.render()),
      setAlliance: (a) => ((settings.alliance = a), saveSettings(), pick.render()),
      setSkill: (s) => ((settings.skill = s), saveSettings(), pick.render()),
      setRunMine: (v) => ((runMine = v), pick.render()),
      start: () => void go(pickPractice ? 'practice' : 'match'),
      home: () => (pick.hide(), home.show(homeInfo())),
    },
  )
  const placeholder = createPlaceholder(overlay, () => void go('home'))
  const tScreen = createTournamentScreen(overlay, {
    setPlayers: (n) => {
      reg.players = n
      setPlayersCount(n)
      showTour()
    },
    setName: (p, name) => {
      names[p] = name
      store.saveProfile(profile)
      showTabs()
      showTour()
    },
    setPerTeam: (n) => ((reg.perTeam = n), showTour()),
    register: () => (reg.players === 2 ? showTour('keytest') : drawTour()),
    keysDone: () => drawTour(),
    pit: () => showTour('pit'),
    schedule: () => showTour('schedule'),
    workshop: (p) => void tourWorkshop(p),
    play: () => void playTour(),
    replay: (i) => {
      tourIndex = i
      void go('treplay')
    },
    newTour: () => {
      tourToken++
      tour = null
      tourCorrupt = false
      tourSaveFailed = !saveTournamentVerified(store, null)
      showTour('register')
    },
    home: () => void go('home'),
  })
  const tControls = PLAYERS.map((p) => configControls(() => cfgOf(p), (cfg) => editors.setConfig(p, cfg)))
  const missionList = createMissionList(overlay, { open: (id) => void go('mission', { id }), home: () => void go('home') })
  shell.onHome(() => void go('home'))

  // ---------- Xưởng lập trình ----------
  const wsControls = PLAYERS.map((p) => configControls(() => cfgOf(p), (cfg) => editors.setConfig(p, cfg)))
  /**
   * Bản nháp chưa lưu (R94, chỉ trong phiên): rời Xưởng hay đổi robot / đế ở Xưởng thì giữ chương trình đang sửa theo
   * (bạn, cấu hình lúc mở); vào lại Xưởng với đúng (bạn, robot) đó thì nạp lại bản nháp, nhãn "Chưa lưu". Trận vẫn
   * chạy bản ĐÃ LƯU (hoặc Mặc định).
   */
  const drafts = new Drafts()
  /** Cấu hình robot và chương trình gốc (bản đã lưu / Mặc định, dạng lưu của vùng khối) lúc nạp vào Xưởng. */
  let wsCfg: RobotConfig | null = null
  let wsBase: object = {}
  const wsDirty = () => screen === 'workshop' && !sameProgram(editors.program(wsPlayer), wsBase)
  const captureDraft = () => {
    if (screen === 'workshop' && wsCfg) drafts.keep(wsPlayer, wsCfg, editors.program(wsPlayer), wsBase)
  }
  /** Nạp chương trình của bạn wsPlayer vào Xưởng: bản nháp nếu có, không thì bản đã lưu / Mặc định. */
  const loadWorkshop = () => {
    const cfg = cfgOf(wsPlayer)
    const d = drafts.get(wsPlayer, cfg)
    if (d) {
      editors.load(wsPlayer, d.state)
      wsBase = d.base
    } else {
      const rec = saved(wsPlayer, cfg)
      editors.load(wsPlayer, rec ? rec.state : sample(cfg, 'teleop'))
      wsBase = editors.program(wsPlayer)
    }
    wsCfg = cfg
  }
  let pickMsg: { text: string; ok: boolean } | null = null
  const wsBar = createWorkshopBar((p) => wsControls[p], {
    setPlayer: (p) => void (wsReturn ? tourWorkshop(p) : go('workshop', { player: p })),
    save() {
      const state = editors.program(wsPlayer)
      const r = saveVerified(store, wsPlayer, cfgOf(wsPlayer), state)
      if (r.ok) {
        wsBase = state
        drafts.drop(wsPlayer, cfgOf(wsPlayer))
      }
      wsBar.message(r.text, r.ok)
      showWorkshop()
      // Mở từ Pit: lưu được thì quay lại Pit, trận sau chạy bản vừa lưu.
      if (r.ok && wsReturn === 'tournament') {
        tourNote = { text: `${r.text} — trận sau robot của ${names[wsPlayer]} chạy bản này`, ok: true }
        void go('tournament')
      }
    },
    back: () => void go('tournament'),
    reset() {
      const r = resetVerified(store, wsPlayer, cfgOf(wsPlayer))
      if (r.ok) {
        drafts.drop(wsPlayer, cfgOf(wsPlayer))
        editors.load(wsPlayer, sample(cfgOf(wsPlayer), 'teleop'))
        wsBase = editors.program(wsPlayer)
      }
      wsBar.message(r.text, r.ok)
      showWorkshop()
    },
    download: () => editors.download(wsPlayer),
  })
  shell.side.blocks.prepend(wsBar.el)
  let shownDirty = false
  const showWorkshop = () => {
    shownDirty = wsDirty()
    wsBar.show({ player: wsPlayer, players: players(), names, label: shownDirty ? 'Chưa lưu' : programText(saved(wsPlayer), true), tournament: wsReturn === 'tournament' })
  }
  // Nhãn Xưởng đổi "Chưa lưu" ⇄ "Của em vN / Mặc định" khi vùng khối đổi (chờ 200 ms, chỉ vẽ lại khi trạng thái đổi).
  let dirtyTimer = 0
  editors.onChange(() => {
    if (screen !== 'workshop') return
    clearTimeout(dirtyTimer)
    dirtyTimer = window.setTimeout(() => {
      if (screen === 'workshop' && wsDirty() !== shownDirty) showWorkshop()
    }, 200)
  })

  // Đổi robot / đế / cơ cấu (Trước trận, ⚙, Xưởng): nhớ vào cài đặt; ở trận / Xưởng nạp chương trình của robot mới.
  editors.onConfig((p, cfg) => {
    if (p === 0) settings.robot = cfg
    else settings.robot2 = cfg
    saveSettings()
    showTabs()
    if (isMatch()) {
      editors.load(p, programFor(p as Player))
      void restart()
    } else if (screen === 'tournament') {
      if (tScreen.view === 'register') showTour()
    } else if (screen === 'workshop' && p === wsPlayer) {
      captureDraft() // giữ bản đang sửa của robot cũ (wsCfg) trước khi nạp chương trình của robot mới
      loadWorkshop()
      wsBar.message(null)
      showWorkshop()
      void restart()
    }
  })

  // ---------- Nhiệm vụ con rùa (màn ②) ----------
  const missionHud = createMissionHud(stage, { grade: () => pressMission(), list: () => void go('missions') })
  /** Robot ghế 0 và trận của phiên `g` nhìn từ lần chạy nhiệm vụ. */
  const viewOf = (g: GameSession): RunView => ({
    get pose() {
      return g.robots[0].pose
    },
    get ports() {
      return g.ports[0] ?? NEUTRAL
    },
    get events() {
      return g.match.events
    },
    footprint: () => g.robots[0].footprint(),
    tally: () => g.match.tally(),
  })
  let missionView: RunView | null = null
  const showSide = () => {
    if (mission) renderSideList(shell.side.missions, missionCards(store), mission.id, (id) => void go('mission', { id }))
  }
  /** Phiên nhiệm vụ mới vừa dựng (vào màn, ▶, Về chỗ cũ): chưa có lần chạy, vệt xoá, mục tiêu chưa tích. */
  const missionReady = () => {
    if (!mission) return
    mrun = null
    scene.trail(null)
    missionView = viewOf(game)
    game.onStep = missionStep
    missionHud.hideResult()
    missionHud.goals(pendingGoals(mission), null)
  }
  /** ▶ ở màn ②: robot về chỗ xuất phát, vệt xoá, rồi chạy chương trình đang có trên vùng khối. */
  const startMission = async () => {
    if (!mission) return
    await restart()
    if (screen !== 'mission' || !mission || !missionView) return
    const program = editors.program(0)
    mEmptyLoop = loopEmpty(program)
    mrun = new MissionRun(mission, program, missionView)
    editors.run(0)
  }
  /** Mỗi bước vật lý của phiên nhiệm vụ: ghi vệt, xét lúc chấm (R57/R59/R95). */
  const missionStep = (g: GameSession) => {
    if (g !== game || !mission || !mrun || mrun.done || !missionView) return
    const link = editors.link(0)
    const waiting = mission.kind === 'program' && restWaits(editors.blockType(0, link.block), link.phase, mEmptyLoop)
    if (mrun.step(missionView, PHYSICS_DT, waiting)) finishMission()
  }
  /** Bấm Chấm / Dừng giữa lần chạy: chấm ngay. */
  const pressMission = () => {
    if (screen !== 'mission' || !mission) return
    if (mrun && !mrun.done && missionView) {
      mrun.press(missionView)
      finishMission()
    } else if (!mrun) missionHud.goals(pendingGoals(mission), mission.kind === 'drive' ? 'Lái robot trước rồi bấm Chấm.' : 'Bấm ▶ để chạy trước đã.')
  }
  const nextOf = (m: Mission) => MISSIONS[MISSIONS.indexOf(m) + 1] ?? null
  /** Lưu kết quả (sao tốt nhất không giảm), hiện màn sao. */
  const showGraded = (m: Mission, r: ReturnType<typeof grade>, program: object | null) => {
    const prev = store.mission(m.id)
    const next = mergeProgress(prev, r, program)
    const saved = saveMissionVerified(store, m.id, next)
    if (saved.ok) {
      profile.stars = totalStars(store)
      store.saveProfile(profile)
    }
    if (r.done) sound.ting()
    const after = nextOf(m)
    missionHud.result(r, saved.ok ? next.stars : prev.stars, saved.ok ? { ok: true, text: 'Đã lưu tiến độ' } : saved, {
      retry: () => (m.kind === 'match' ? void go('mission', { id: m.id }) : void startMission()),
      list: () => void go('missions'),
      next: after ? () => void go('mission', { id: after.id }) : undefined,
    })
  }
  const finishMission = () => {
    if (!mission || !mrun?.result) return
    editors.stop(0)
    missionHud.goals(mrun.result.goals, mrun.result.hint)
    showGraded(mission, mrun.result, editors.program(0))
    showSide()
  }
  /** Nhiệm vụ trận: chấm khi hết giờ trên điểm và nhật ký của trận. */
  const finishMatchMission = (m: Mission) => {
    const seat = Math.max(0, playerSeat(modes, 0))
    const r = grade(m, {
      start: m.start, end: game.robots[seat].pose, trail: { distance: 0, turned: 0, time: 0 }, touchedMountain: false,
      events: [...game.match.events], tally: game.match.tally(), program: null,
    })
    showGraded(m, r, store.mission(m.id).program)
  }
  // Chương trình đang làm của nhiệm vụ: lưu sau khi vùng khối thôi đổi 1 s (đọc lại để chắc đã lưu). Lưu theo nhiệm vụ
  // mà vùng khối đang giữ chương trình (`wsMission`, đặt lúc nạp) — không theo `mission`, vì `go` đổi `mission` trước
  // khi vào màn mới; chuyển nhanh sang nhiệm vụ khác trong 1 s thì lưu ngay cho nhiệm vụ cũ.
  let mSaveTimer = 0
  let mSaveId: string | null = null
  let wsMission: string | null = null
  const saveMissionProgram = () => {
    clearTimeout(mSaveTimer)
    mSaveTimer = 0
    const id = mSaveId
    mSaveId = null
    if (!id || id !== wsMission) return
    const prev = store.mission(id)
    const program = editors.program(0)
    if (sameProgram(prev.program, program)) return
    const r = saveMissionVerified(store, id, { ...prev, program })
    missionHud.note(r.ok ? null : 'Không lưu được chương trình — trình duyệt đang chặn bộ nhớ. Tải .tb về máy để giữ.')
  }
  /** Lưu ngay nếu còn bản chờ lưu (rời nhiệm vụ / đổi nhiệm vụ). */
  const flushMissionProgram = () => {
    if (mSaveTimer) saveMissionProgram()
  }
  editors.onChange(() => {
    if (screen !== 'mission' || !wsMission) return
    clearTimeout(mSaveTimer)
    mSaveId = wsMission
    mSaveTimer = window.setTimeout(saveMissionProgram, MISSION_SAVE_MS)
  })

  // ---------- ⚙ ----------
  const stControls = PLAYERS.map((p) => configControls(() => cfgOf(p), (cfg) => editors.setConfig(p, cfg)))
  const reopen = () => popover.open(settingsCtx())
  /** "Của em v2" (một bạn) hoặc "Của em (Bạn 1 v2 · Bạn 2 chưa lưu)"; null khi không bạn nào có bản lưu. */
  const mineText = (): string | null => {
    const ps = PLAYERS.slice(0, players())
    const vs = ps.map((p) => saved(p)?.version ?? null)
    if (vs.every((v) => v === null)) return null
    if (ps.length === 1) return `Của em v${vs[0]}`
    return `Của em (${ps.map((p, k) => `${names[p]} ${vs[k] === null ? 'chưa lưu' : `v${vs[k]}`}`).join(' · ')})`
  }
  const settingsCtx = (): SettingsCtx => ({
    screen,
    camera: cam === 'orbit' ? 'field' : cam,
    setCamera,
    quality: q,
    setQuality: (v) => {
      q = v
      scene.quality(v)
      settings.quality = v
      saveSettings()
    },
    sound: settings.sound,
    setSound: (v) => ((settings.sound = v), saveSettings()),
    layout2p: settings.layout2p,
    setLayout2p: (v) => {
      settings.layout2p = v
      saveSettings()
      makePads()
      // Trận / Xưởng dựng lại theo số bạn mới (đổi màn đóng ⚙ ⇒ mở lại sau khi dựng xong).
      if (isMatch()) void go(screen).then(reopen)
      else if (screen === 'workshop') void go('workshop', { player: v ? wsPlayer : 0 }).then(reopen)
      else (showTabs(), reopen())
    },
    names,
    cfg: cfgOf,
    match: isMatch()
      ? {
          practice: screen === 'practice',
          setPractice: (v) => void go(v ? 'practice' : 'match').then(reopen),
          robots: PLAYERS.slice(0, players()).map((p) => ({ label: players() === 2 ? `Robot của ${names[p]}` : 'Robot của em', ...stControls[p] })),
          alliance: settings.alliance,
          setAlliance: (a) => ((settings.alliance = a), saveSettings(), void go(screen).then(reopen)),
          skill: settings.skill,
          setSkill: (s) => ((settings.skill = s), saveSettings(), void go(screen).then(reopen)),
          runMine,
          saved: mineText(),
          setRunMine: (v) => {
            // Không về ghế mặc định: chỉ nạp lại chương trình của các bạn đang lái rồi dựng lại trận.
            runMine = v
            for (const p of PLAYERS) if (playerSeat(modes, p) >= 0) editors.load(p, programFor(p))
            void restart().then(reopen)
          },
          speeds: SPEEDS,
          speed: speedNow,
          locked: () => editors.anyActive(),
          setSpeed: (s) => void setSpeed(s),
          seats: {
            modes,
            labels: [0, 1, 2, 3].map((i) => `Robot ${i + 1} · ${ALLIANCE_SEAT[i]}`),
            options: seatOptions(names, players()),
            set: (i, m) => {
              setMode(i, m)
              reopen() // ô chọn ghế khác có thể đã đổi (mỗi bạn một ghế — assignSeat)
            },
          },
        }
      : undefined,
  })
  shell.onSettings(() => popover.toggle(settingsCtx()))

  // ---------- Đổi màn ----------
  /** Phần giao diện của màn (không dựng lại phiên). */
  const enter = (next: Screen, arg?: GoArg) => {
    captureDraft() // rời Xưởng (kể cả đổi bạn): giữ bản đang sửa
    flushMissionProgram() // rời / đổi nhiệm vụ: lưu ngay bản đang làm cho đúng nhiệm vụ đó
    wsMission = null
    popover.close()
    home.hide()
    pick.hide()
    placeholder.hide()
    tScreen.hide()
    missionList.hide()
    if (next !== 'mission') missionHud.hide()
    mrun = null
    scene.trail(null) // vệt chỉ có ở màn ②, vẽ lại từ khung sau
    const prevScreen = screen
    screen = next
    const c = chrome(next)
    shell.activity(c.activity)
    shell.runbarVisible(c.runbar)
    board.visible(c.scoreboard)
    board.hideResult()
    board.clearFx()
    cards.visible(isMatch() || next === 'workshop' || next === 'tmatch')
    // Xem nhanh chạy ×40 (không có chương trình nào nên R24 không khoá); rời Xem nhanh về ×1.
    if (next === 'treplay') requested = 40
    else if (prevScreen === 'treplay') requested = 1
    if (next !== 'tournament') tourNote = null
    keypads.forEach((k) => k.releaseAll())
    editors.stopAll()
    if (isMatch()) {
      modes = defaultSeats(settings.alliance, matchMission ? 'easy' : settings.skill, players())
      clearFollowers()
      for (const p of PLAYERS) if (playerSeat(modes, p) >= 0) editors.load(p, programFor(p))
    } else clearFollowers()
    if (next === 'tmatch') for (const p of PLAYERS) if (tourSeat(p) >= 0) editors.load(p, tourProgram(p))
    // Nhiệm vụ: hộp công cụ của nhiệm vụ; màn khác: hộp công cụ đầy đủ.
    editors.setToolbox(0, next === 'mission' && mission ? mission.toolbox : TOOLBOX)
    if (next === 'mission' && mission) {
      const prog = store.mission(mission.id)
      editors.load(0, prog.program ?? mission.starter ?? sample(mission.robot, 'teleop'))
      wsMission = mission.id
      editors.show(0)
      wsBar.hide()
      shell.open('blocks')
      missionHud.show(mission, prog.stars)
    } else if (next === 'workshop') {
      wsReturn = arg?.returnTo ?? null
      wsPlayer = players() === 2 ? (arg?.player ?? 0) : 0
      loadWorkshop()
      editors.show(wsPlayer)
      wsBar.message(null)
      showWorkshop()
      shell.open('blocks')
    } else {
      wsBar.hide()
      shell.open(null)
    }
    showTabs()
    if (next === 'workshop' || isMatch()) editors.show(next === 'workshop' ? wsPlayer : 0)
    if (next === 'tmatch') editors.show(Math.max(0, PLAYERS.findIndex((p) => tourSeat(p) >= 0)))
    cam = defaultCamera(next)
  }
  /** Sau khi phiên mới đã dựng: hiện màn phủ (màn chính / màn chờ). */
  const shown = (next: Screen) => {
    scene.camera(cam, mySeat())
    if (next === 'home') home.show(homeInfo())
    else if (next === 'missions') missionList.show(missionCards(store))
    else if (next === 'mission') showSide()
    else if (next === 'tournament') showTour(tourCorrupt ? 'corrupt' : !tour ? 'register' : nextMatch(tour) === null ? 'podium' : 'pit')
  }
  let going = Promise.resolve()
  /** Đổi màn; 'mission' cần `arg.id` (thiếu ⇒ nhiệm vụ vừa làm). Nhiệm vụ trận (12) mở màn Trận lẻ, robot máy mức Dễ. */
  const go = (next: Screen, arg?: GoArg): Promise<void> => {
    going = going
      .then(async () => {
        flushMissionProgram() // trước khi `mission` đổi sang nhiệm vụ mới
        let to = next
        // Dựng lại Trận lẻ đang chơi nhiệm vụ trận (⚙ đổi liên minh…) thì vẫn là nhiệm vụ đó; vào Trận lẻ khác thì không.
        let mm = next === 'match' && screen === 'match' ? matchMission : null
        if (next === 'mission') {
          const m = MISSIONS.find((x) => x.id === arg?.id) ?? mission ?? MISSIONS[0]
          if (m.kind === 'match') ((to = 'match'), (mm = m))
          else mission = m
        }
        matchMission = mm
        enter(to, arg)
        await restart()
        shown(to)
      })
      .catch((e) => console.error('Không đổi màn được:', e))
    return going
  }

  // ---------- Giải đấu: các màn phủ sân, trận máy chạy ngầm, ghi kết quả ----------
  const tourPlayers = (t: TournamentState): 1 | 2 => (t.entrants.filter((e) => e.kind === 'player').length === 2 ? 2 : 1)
  /** Số bạn của giải ⇒ bàn phím một bạn (solo) / chia đôi (left / right), như ⚙ › Hai bạn chơi. */
  const setPlayersCount = (n: 1 | 2) => {
    if (players() === n) return
    settings.layout2p = n === 2
    saveSettings()
    makePads()
    showTabs()
  }
  const padText = (st: SeatStatus | undefined, n: number) =>
    st === 'ok' ? `Tay PS2 thứ ${n}: đã nhận` : st === 'nonstandard' ? `Tay thứ ${n} không chuẩn — dùng bàn phím` : `Chưa có tay PS2 thứ ${n} — dùng bàn phím`
  const pitView = (t: TournamentState): PitView => ({
    state: t,
    rows: standingRows(t, (e) => tourLabel(e.player ?? 0)),
    next: nextMatch(t),
    busy: machineBusy,
    notes: [...(tourSaveFailed ? [{ text: SAVE_TOUR_FAILED, ok: false }] : []), ...(tourNote ? [tourNote] : [])],
    players: t.entrants.flatMap((e) => (e.kind === 'player' ? [{ player: e.player ?? 0, name: e.name }] : [])),
  })
  /** Vẽ màn giải đấu `v` (mặc định: màn đang hiện). Chỉ khi đang ở màn 'tournament'. */
  const showTour = (v = tScreen.view ?? 'register') => {
    if (screen !== 'tournament') return
    // Ghi danh, Thử phím: chưa có giải (bốc thăm mới tạo); các màn khác cần giải.
    if (!tour && v !== 'corrupt' && v !== 'keytest') v = 'register'
    if (tour && v === 'pit' && nextMatch(tour) === null) v = 'podium'
    setPlayersCount(tour ? tourPlayers(tour) : reg.players)
    if (v === 'register')
      tScreen.register({ players: reg.players, perTeam: reg.perTeam, names, cfg: cfgOf, program: (p) => programText(saved(p)), controls: (p) => tControls[p] })
    else if (v === 'keytest') {
      const st = seats.read().status
      tScreen.keytest(names, [padText(st[0], 1), padText(st[1], 2)])
    } else if (v === 'corrupt') tScreen.corrupt()
    else if (tour && v === 'schedule') tScreen.schedule(tour)
    else if (tour && v === 'podium') tScreen.podium(tour, standingRows(tour, (e) => tourLabel(e.player ?? 0)))
    else if (tour) {
      tScreen.pit(pitView(tour))
      runMachines()
    }
  }
  /** Bốc thăm: giải mới từ phần ghi danh (robot của từng bạn lúc này), lưu ngay (đọc lại để chắc). */
  const drawTour = () => {
    tourToken++
    machineFailed = false
    const seed = tourSeed ?? Math.floor(Math.random() * 2147483646) + 1
    tour = newTournament({ names, cfgs: [cfgOf(0), cfgOf(1)], players: reg.players, perTeam: reg.perTeam, seed })
    tourCorrupt = false
    tourSaveFailed = !saveTournamentVerified(store, tour)
    showTour('schedule')
  }
  /** Robot của bạn p về đúng robot đã ghi danh (Trận lẻ có thể đã đổi robot). */
  const tourRobot = (p: Player) => {
    const e = tourEntrant(p)
    if (e && JSON.stringify(cfgOf(p)) !== JSON.stringify(e.robot)) editors.setConfig(p, e.robot)
  }
  const tourWorkshop = (p: Player) => {
    if (!tourEntrant(p)) return
    tourRobot(p)
    return go('workshop', { player: p, returnTo: 'tournament' })
  }
  /** Vào trận kế tiếp của giải (trận có người chơi; trận máy trước đó đã chạy xong). */
  const playTour = () => {
    if (!tour || machineBusy) return
    const i = nextMatch(tour)
    if (i === null || !playersIn(tour, i).length) return
    for (const x of playersIn(tour, i)) tourRobot(x.player)
    tourIndex = i
    return go('tmatch')
  }
  /** Ghi kết quả trận i, lưu (đọc lại), chạy tiếp các trận máy, vẽ lại màn giải. */
  const commitTour = (i: number, p: Played) => {
    if (!tour || tour.results[i] !== null) return
    tour = record(tour, i, p)
    tourSaveFailed = !saveTournamentVerified(store, tour)
    runMachines()
    showTour()
  }
  /** Hết giờ trận giải có người chơi: ghi điểm đội + phạt theo ghế (như trận máy ngầm). Trận dở không bao giờ ghi. */
  const finishTourMatch = (m: GameSession['match']) => {
    if (!tour || m !== game.match || m.phase !== 'end' || nextMatch(tour) !== tourIndex) return
    const r = m.result()
    const teams = r.teams.map((t, k) => ({ score: t.score, penalty: penaltyPoints(m.pens[k], r.score.total) }))
    commitTour(tourIndex, played(seatIds(tour.schedule[tourIndex]), teams, r.score.total))
  }
  /** Trận máy lỗi (không dựng được sân…): báo ở Pit, không chạy lại vòng vòng. */
  let machineFailed = false
  /** Chạy ngầm các trận toàn máy từ trận kế tiếp (từng lát, sân / nút vẫn mượt) và ghi ngay khi xong. */
  const runMachines = () => {
    if (machineRun || machineFailed || !tour || !pendingMachines(tour).length) return
    const token = tourToken
    machineRun = true
    void (async () => {
      try {
        for (;;) {
          const t = tour
          if (!t || token !== tourToken) return
          const i = pendingMachines(t)[0]
          if (i === undefined) return
          machineBusy = `Đang chơi các trận máy… (trận ${i + 1}/${t.schedule.length})`
          showTour()
          const es = seatIds(t.schedule[i]).map((id) => t.entrants.find((e) => e.id === id)!)
          const r = await playAgents({ cfgs: es.map((e) => e.robot), skills: es.map((e) => e.skill ?? 'medium'), teams: es.map((e) => e.name), seed: matchSeed(t, i), sliceMs: MACHINE_SLICE_MS })
          if (!tour || token !== tourToken) return
          commitTour(i, played(seatIds(t.schedule[i]), r.teams, r.match))
        }
      } catch (e) {
        machineFailed = true
        tourNote = { text: `Không chơi được trận máy: ${e instanceof Error ? e.message : String(e)}`, ok: false }
      } finally {
        machineRun = false
        machineBusy = null
        showTour()
      }
    })()
  }

  // ---------- Bàn phím ----------
  const driving = () => isMatch() || screen === 'tmatch' || screen === 'workshop' || screen === 'mission' || (screen === 'tournament' && tScreen.view === 'keytest')
  document.addEventListener('keydown', (e) => {
    if (popover.shown) return
    if (home.shown) {
      if (home.key(e)) e.preventDefault()
      return
    }
    // Phím tắt (Ctrl / ⌘ / Alt + phím) không lái robot: Ctrl+S, ⌘+W… không được thành "chạy tới".
    if (!driving() || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
    let used = false
    for (const k of keypads) used = k.down(e.code) || used
    if (used) e.preventDefault()
  })
  // Nhả phím luôn được nhận (kể cả khi đang gõ): không phím nào kẹt.
  document.addEventListener('keyup', (e) => keypads.forEach((k) => k.up(e.code)))
  const releaseAll = () => keypads.forEach((k) => k.releaseAll())
  window.addEventListener('blur', releaseAll)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll()
  })

  hud.onSelect = (i) => {
    if (cam !== 'field' && cam !== 'orbit') scene.camera(cam, i)
  }

  // ---------- Mỗi khung ----------
  /** Tay PS2 ảo của bạn p ở khung này: tay thật (khi có tín hiệu) thắng bàn phím. */
  const padOf = (p: Player, real: (Record<string, number> | null)[]) =>
    mergePad(real[p] ?? null, keypads[p]?.state((screen === 'mission' && mission ? mission.robot : cfgOf(p)).drive) ?? PS2_NEUTRAL)
  const inputOf = (p: Player, status: SeatStatus[]): 'Bàn phím' | 'Tay PS2' => (status[p] === 'ok' && !keypads[p]?.active() ? 'Tay PS2' : 'Bàn phím')

  /** Thanh chạy + thanh trạng thái + tô khối, theo thẻ đang mở. */
  let fps = 60
  const showRun = (status: SeatStatus[]) => {
    const p = editors.active as Player
    const state: LinkState = editors.state(p)
    const canStep = game.robots.some((_, k) => game.driver(k).kind === 'program')
    shell.runbar(handlers, state, { busy: game.stepping, paused: game.paused, canStep })
    for (const k of PLAYERS) {
      const s = editors.state(k)
      editors.highlight(k, s === 'running' || s === 'paused' ? editors.link(k).block : undefined)
    }
    const seat = seatOfPlayer(p)
    const input: InputKind = seat < 0 ? 'Máy' : inputOf(p, status)
    shell.status({
      robot: `${names[p]} · ${robotName(cfgOf(p))}`,
      input,
      ports: seat >= 0 ? (game.ports[seat] ?? NEUTRAL) : NEUTRAL,
      block: state === 'running' || state === 'paused' ? editors.describe(p, editors.link(p).block) : null,
      fps,
    })
  }

  const showCards = (status: SeatStatus[]) => {
    if (!(isMatch() || screen === 'workshop' || screen === 'tmatch')) return
    const list: CardInfo[] = []
    for (const p of PLAYERS) {
      const seat = seatOfPlayer(p)
      if (seat < 0) continue
      const r = game.robots[seat]
      list.push({
        player: names[p],
        robot: robotName(cfgOf(p)),
        program: screen === 'workshop' ? 'đang sửa ở Xưởng' : screen === 'tmatch' ? tourLabel(p) : label(p),
        input: inputOf(p, status),
        pad: { n: p + 1, status: status[p] },
        held: r ? r.stored.length : 0,
        storage: r ? r.def.storage : 0,
        warnings: deadZoneLines(game.ports[seat]),
      })
    }
    cards.update(list)
  }

  // Bảng điểm: dòng điểm ≤ SCORE_HZ lần/giây + báo nổi; đếm ngược 3 s cuối xả bóng; còi; màn kết quả khi hết giờ.
  let boardMatch = game.match
  let prevT = game.match.t
  let resultShown = false
  const showBoard = (now: number) => {
    const m = game.match
    if (m !== boardMatch) {
      boardMatch = m
      prevT = m.t
      resultShown = false
    }
    // Màn không có bảng điểm (màn chính, Xưởng, nhiệm vụ): không tính điểm, không "ting".
    if (!chrome(screen).scoreboard || game.mode === 'mission') return
    const out = ticker.tick(now, m, game.robots, programs(), teamNames)
    if (out) {
      board.update(out.line, out.pops)
      if (out.pops.some((p) => p.startsWith('+'))) sound.ting()
    }
    if (!m.practice) {
      const cue = countdownCue(prevT, m.t)
      if (cue !== null) {
        board.countdown(cue)
        if (cue === 0) sound.whistle()
        else sound.beep()
      }
      if (m.phase === 'end' && !resultShown) {
        resultShown = true
        sound.whistle(true)
        const view = resultView(m, game.robots, programs(), teamNames)
        if (screen === 'tmatch') {
          finishTourMatch(m)
          board.result(view, { home: () => void go('home'), next: () => void go('tournament') })
        } else if (screen === 'treplay') board.result(view, { home: () => void go('home'), next: () => void go('tournament'), nextLabel: 'Về Pit' })
        else
          board.result(view, {
            again: () => void restart(),
            home: () => void go('home'),
          })
        if (matchMission && screen === 'match') finishMatchMission(matchMission)
      }
    }
    prevT = m.t
  }

  let last = performance.now()
  let lastPreview = 0
  const frame = (now: number) => {
    const { pads, status } = seats.read()
    for (const p of PLAYERS) editors.input(p, padOf(p, pads))
    if (screen === 'tournament' && tScreen.view === 'keytest') {
      const live = (p: Player) => keypads[p]?.active() || (!!pads[p] && mergePad(pads[p], PS2_NEUTRAL) === pads[p])
      tScreen.lit([live(0), live(1)], [padText(status[0], 1), padText(status[1], 2)])
    }
    editors.release()
    const speed = speedNow()
    const dt = Math.min(100, now - last) / 1000
    if (now > last) fps += (1000 / (now - last) - fps) * 0.05
    last = now
    // Trận máy đang chạy ngầm (màn giải đấu): sân nền đứng yên để nhường máy cho trận ngầm.
    if (chrome(screen).live && !(screen === 'tournament' && machineRun)) game.advance(dt, speed, { steps: MAX_STEPS * Math.max(1, speed), ms: STEP_BUDGET_MS })
    if (screen === 'mission' && mission) {
      // Vệt + đường gợi ý, ô số đo, thẻ thử thách tự tích ✓ (chấm thử ≤ PREVIEW_HZ lần/giây).
      const tr = mrun?.trail
      scene.trail(tr ? tr.segments : [], mission.path)
      missionHud.measure(tr ? { distance: tr.distance, turned: tr.turned, time: tr.time } : { distance: 0, turned: 0, time: 0 })
      if (mrun && !mrun.done && missionView && now - lastPreview >= 1000 / PREVIEW_HZ) {
        lastPreview = now
        missionHud.goals(mrun.preview(missionView).goals, null)
      }
    }
    scene.sync(game.world, game.robots, game.match, game.ports)
    hud.update(game.match, game.robots, game.cfgs, game.ports)
    showBoard(now)
    showRun(status)
    showSerial()
    showCards(status)
    popover.update()
    requestAnimationFrame(frame)
  }

  // Mở trang ⇒ màn chính (phiên nền đã dựng ở trên).
  enter('home')
  expose()
  shown('home')
  requestAnimationFrame(frame)
}

const loading = document.createElement('div')
loading.className = 'sh-loading'
loading.textContent = 'Sân đang tải…'
loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#ccc;font-size:15px'
stage.append(loading)
start().catch((e) => {
  loading.textContent = `Không khởi tạo được sân: ${e instanceof Error ? e.message : String(e)}`
})
