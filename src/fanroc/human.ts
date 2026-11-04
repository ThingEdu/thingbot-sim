// Human Player: khay bóng, nhặt bóng trong Khu Xuất Phát, nạp cho robot ở Khu Tiếp Tế (spec §4.2, luật P04–P07).
// Chỉ là logic thuần trên thế giới vật lý. Human Player luôn tự động (`auto`, chốt 04/11: bỏ phím Q/A/S/D–U/J/K/L);
// `press` là từng thao tác luật mà `auto` gọi (và phép thử gọi thẳng).
import type { FanrocWorld } from './world.ts'
import type { RobotBody } from './robot.ts'
import { ZONES, type Alliance, type Phase, type Rect } from './layout.ts'

export type HpAction = 'pick' | 'orange' | 'green' | 'load'
export type HpContext = { world: FanrocWorld; robots: RobotBody[]; phase: Phase; endgame: boolean }

/** Human Player tự động nhặt và nạp mỗi chừng này giây. */
const AUTO_EVERY = 0.8
const NAME = { o: 'cam', g: 'xanh' } as const

const cornerIn = (r: Rect, p: { x: number; z: number }) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1

export class HumanPlayer {
  readonly alliance: Alliance
  tray = { o: 0, g: 0 }
  /** Màu đang chọn để nạp. */
  color: 'o' | 'g' = 'o'
  /** Nhận thông báo ("Human Player nhặt bóng cam", "Robot 2 nhận bóng xanh"). */
  onEvent?: (text: string) => void
  /** Chỉ số các bóng trong khay (st 'tray') theo màu, thứ tự nhặt. */
  private readonly held: { o: number[]; g: number[] } = { o: [], g: [] }
  private pickWait = 0
  private loadWait = 0

  constructor(alliance: Alliance) {
    this.alliance = alliance
  }

  /** Trả null khi làm được, ngược lại là lý do bằng tiếng Việt. */
  press(action: HpAction, ctx: HpContext): string | null {
    if (ctx.phase === 'release') return 'Chưa được nạp bóng'
    if (ctx.phase === 'end') return 'Hết giờ'
    if (action === 'orange') this.color = 'o'
    else if (action === 'green') this.color = 'g'
    else if (action === 'pick') return this.pick(ctx)
    else return this.load(ctx)
    return null
  }

  private pick(ctx: HpContext): string | null {
    const [i] = ctx.world.ballsIn(ZONES.start[this.alliance])
    if (i === undefined) return 'Không có bóng trong Khu Xuất Phát'
    const c = ctx.world.balls[i].color
    ctx.world.trayBall(i)
    this.held[c].push(i)
    this.tray[c]++
    this.onEvent?.(`Human Player nhặt bóng ${NAME[c]}`)
    return null
  }

  private load(ctx: HpContext): string | null {
    const mine = ctx.robots.filter((r) => r.alliance === this.alliance)
    const zone = ZONES.load[this.alliance]
    const parked = (r: RobotBody) => ctx.endgame && r.parked
    const inZone = mine.filter((r) => r.footprint().some((p) => cornerIn(zone, p)))
    const eligible = inZone.filter((r) => !parked(r))
    if (eligible.length === 0) {
      const allParked = mine.length > 0 && mine.every(parked)
      return inZone.length > 0 || allParked ? 'Robot đã về Vùng Bảo Vệ' : 'Robot chưa vào Khu Tiếp Tế'
    }
    // Ruling R33: robot không có cửa xả (S3, vd. Xe Ủi) không nhận bóng — nhận rồi cũng không đưa ra được.
    const gated = eligible.filter((r) => r.def.servos.S3 !== undefined)
    if (gated.length === 0) return 'Robot không có cửa xả'
    const c = this.color
    const i = this.held[c][0]
    if (i === undefined) return `Khay hết bóng ${NAME[c]}`
    const robot = gated.find((r) => r.take(i, c))
    if (!robot) return 'Robot đầy bóng'
    this.held[c].shift()
    this.tray[c]--
    this.onEvent?.(`Robot ${ctx.robots.indexOf(robot) + 1} nhận bóng ${NAME[c]}`) // số như trên bảng điểm (thứ tự robot của trận)
    return null
  }

  /** Chế độ tự động: mỗi 0.8 s nhặt một bóng và nạp một bóng. */
  auto(ctx: HpContext, dt: number): void {
    this.pickWait += dt
    if (this.pickWait >= AUTO_EVERY) {
      this.pickWait -= AUTO_EVERY
      this.press('pick', ctx)
    }
    this.loadWait += dt
    if (this.loadWait < AUTO_EVERY) return
    this.loadWait -= AUTO_EVERY
    const zone = ZONES.load[this.alliance]
    const robot = ctx.robots.find(
      (r) =>
        r.alliance === this.alliance && r.def.servos.S3 !== undefined && !(ctx.endgame && r.parked) &&
        r.footprint().some((p) => cornerIn(zone, p)),
    )
    if (!robot) return
    const { o, g } = this.tray
    this.color = robot.def.hpLoad && g > 0 ? 'g' : g > o ? 'g' : 'o'
    this.press('load', ctx)
  }
}
