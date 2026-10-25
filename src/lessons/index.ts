import { BAI_1 } from './bai1'
import { BAI_2 } from './bai2'
import { BAI_3 } from './bai3'
import type { Lesson } from './types'

export type { Card, Lesson, Observation, Part } from './types'

/** Các bài đã làm, theo thứ tự lộ trình 10 bài (spec mục 4). */
export const LESSONS: Lesson[] = [BAI_1, BAI_2, BAI_3]
