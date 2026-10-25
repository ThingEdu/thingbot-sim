/**
 * Mã mô phỏng cho hai ngoại vi ThingBlock chưa có bản mô phỏng: cảm biến siêu âm và tay cầm PS2.
 * Sinh cùng ý nghĩa với `generator.ts` của từng gói, chạy trên bo ảo của `thingblock-sim`, và đọc
 * số đo mà mạch ảo đặt vào bằng `$.analogRead("<khoá>")` (bo ảo đọc khoá `adc<khoá>`), nên không phải
 * sửa gì trong ThingBlock.
 *
 * - Siêu âm: khoá `sonar_<TRIG>_<ECHO>`. Mạch ảo chỉ cắm cảm biến ở TRIG IO0, ECHO IO4 (đấu nối của
 *   khoá ThingBlock trên robot.edu.vn); khai chân khác thì đọc ra 0 — đúng như cảm biến lỏng dây.
 * - PS2: như thư viện PS2X, `read PS2 receiver data` chép trạng thái tay cầm vào bộ nhớ, còn các khối
 *   hỏi nút/cần đọc từ bộ nhớ đó. Quên khối đọc thì não không bao giờ thấy nút bấm; quên khởi động
 *   bộ thu thì khối đọc không lấy được gì.
 */
import type * as ScratchBlocks from '@scratch/scratch-blocks'

export const SONAR_KEY = 'sonar_0_4'
export const PS2_BUTTONS = ['PSB_PAD_UP', 'PSB_PAD_DOWN', 'PSB_PAD_LEFT', 'PSB_PAD_RIGHT'] as const
export const ps2Key = (name: string) => `ps2_${name}`

type Generator = typeof ScratchBlocks.simGenerator
type Block = Parameters<Generator['forBlock'][string]>[0]

const field = (block: Block, name: string, fallback: string): string => {
  const value: unknown = block.getFieldValue(name)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

const PS2_STATE = [
  'const ps2 = { ready: false, button: {}, analog: {} };',
  'const PS2_ANALOG = ["PSS_LX", "PSS_LY", "PSS_RX", "PSS_RY"];',
  'const PS2_KEYS = ["PSB_PAD_UP", "PSB_PAD_DOWN", "PSB_PAD_LEFT", "PSB_PAD_RIGHT", "PSB_TRIANGLE", "PSB_CIRCLE", "PSB_CROSS", "PSB_SQUARE", "PSB_L1", "PSB_L2", "PSB_L3", "PSB_R1", "PSB_R2", "PSB_R3", "PSB_SELECT", "PSB_START"];',
  'function ps2Read() {',
  '  if (!ps2.ready) return;',
  '  for (const k of PS2_KEYS) ps2.button[k] = $.analogRead("ps2_" + k) > 0;',
  '  for (const k of PS2_ANALOG) ps2.analog[k] = $.analogRead("ps2_" + k) || 128;',
  '}',
].join('\n')

export function registerExtraSimGenerators(generator: Generator, Order: typeof ScratchBlocks.ArduinoOrder) {
  generator.forBlock.ultrasonic_readDistance = (block) => {
    const trig = Number(field(block, 'TRIG', '2')) || 0
    const echo = Number(field(block, 'ECHO', '3')) || 0
    const read = `$.analogRead("sonar_${trig}_${echo}")`
    // Ultrasonic::read(CM) trả số nguyên cm; INC chia 2,54 rồi bỏ phần lẻ.
    const code = field(block, 'UNIT', 'CM') === 'INC' ? `$.toInt(${read} / 2.54)` : `$.toInt(${read})`
    return [code, Order.ATOMIC]
  }

  const ps2 = () => generator.globals.set('ps2', PS2_STATE)
  generator.forBlock.thingBotC3_initPS2 = () => {
    ps2()
    return 'ps2.ready = true;'
  }
  generator.forBlock.ps2_init = () => {
    ps2()
    return 'ps2.ready = true;'
  }
  generator.forBlock.ps2_readData = () => {
    ps2()
    return 'ps2Read();'
  }
  generator.forBlock.ps2_getButton = (block) => {
    ps2()
    return [`(ps2.button.${field(block, 'BUTTON', 'PSB_PAD_UP')} === true)`, Order.ATOMIC]
  }
  generator.forBlock.ps2_GetJoystick = (block) => {
    ps2()
    return [`(ps2.analog.${field(block, 'JOYSTICK', 'PSS_LX')} ?? 128)`, Order.ATOMIC]
  }
}
