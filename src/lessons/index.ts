import { BAI_2 } from './bai2'
import { BAI_3 } from './bai3'
import type { Lesson } from './types'

export type { Card, Lesson, Observation } from './types'

/** Các bài đã làm, theo thứ tự lộ trình 10 bài (spec mục 4). */
export const LESSONS: Lesson[] = [BAI_2, BAI_3]
