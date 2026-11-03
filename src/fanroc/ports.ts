// Giải mã 16 kênh PWM của mạch PCA9685 trên ThingBot thành giá trị cổng motor / servo.
// Bảng kênh và chiều quay chép từ ThingBlock:
// ../thingblock-editor-sim/packages/thingblock-resource/src/extensions/peripheral/thingbot-core/generator.ts
// (#define M*_A / M*_B / SERVO_*, mapToPulse = 0…100 → 0…4095, thingBotC3_setMotor: forward ghi kênh B, backward ghi kênh A).

export type PortValues = {
  M1: number
  M2: number
  M3: number
  M4: number
  S1: number | null
  S2: number | null
  S3: number | null
  S4: number | null
  S5: number | null
}

/** Tất cả động cơ dừng, mọi servo thả. */
export const NEUTRAL: PortValues = { M1: 0, M2: 0, M3: 0, M4: 0, S1: null, S2: null, S3: null, S4: null, S5: null }

/** Kênh [A, B] của từng động cơ: duty B > 0 = tiến (+), duty A > 0 = lùi (−). */
const MOTOR_CH = { M1: [2, 3], M2: [4, 5], M3: [7, 6], M4: [1, 0] } as const
/** SERVO_1..5 = kênh 12, 11, 10, 9, 8. */
const SERVO_CH = { S1: 12, S2: 11, S3: 10, S4: 9, S5: 8 } as const

const DUTY_MAX = 4095
const SERVO_MIN = 102 // 0° (0,5 ms)
const SERVO_MAX = 512 // 180° (2,5 ms)

const motor = (pwm: readonly number[], [a, b]: readonly [number, number]): number =>
  Math.max(-100, Math.min(100, ((pwm[b] ?? 0) - (pwm[a] ?? 0)) / DUTY_MAX * 100))

/** Duty 0 = thả servo (null); còn lại tuyến tính 102…512 → 0…180°, kẹp vào miền. */
const servo = (duty: number): number | null => {
  if (!duty) return null
  return Math.max(0, Math.min(180, (duty - SERVO_MIN) / (SERVO_MAX - SERVO_MIN) * 180))
}

export function decodePorts(pwm: readonly number[]): PortValues {
  return {
    M1: motor(pwm, MOTOR_CH.M1),
    M2: motor(pwm, MOTOR_CH.M2),
    M3: motor(pwm, MOTOR_CH.M3),
    M4: motor(pwm, MOTOR_CH.M4),
    S1: servo(pwm[SERVO_CH.S1] ?? 0),
    S2: servo(pwm[SERVO_CH.S2] ?? 0),
    S3: servo(pwm[SERVO_CH.S3] ?? 0),
    S4: servo(pwm[SERVO_CH.S4] ?? 0),
    S5: servo(pwm[SERVO_CH.S5] ?? 0),
  }
}

/** Servo MG996R quay liên tục: 80…100° (và thả) = dừng, > 100° = tiến, < 80° = lùi, một tốc độ duy nhất. */
export function servo360(angle: number | null): -1 | 0 | 1 {
  if (angle === null) return 0
  if (angle > 100) return 1
  if (angle < 80) return -1
  return 0
}
