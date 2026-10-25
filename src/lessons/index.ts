import { BAI_1 } from './bai1'
import { BAI_10 } from './bai10'
import { BAI_2 } from './bai2'
import { BAI_3 } from './bai3'
import { BAI_4 } from './bai4'
import { BAI_5 } from './bai5'
import { BAI_6 } from './bai6'
import { BAI_7 } from './bai7'
import { BAI_8 } from './bai8'
import { BAI_9 } from './bai9'
import type { Lesson } from './types'

export type { Card, Lesson, Observation, Part } from './types'

/** Mười bài cơ bản, theo thứ tự lộ trình (spec mục 4). */
export const LESSONS: Lesson[] = [BAI_1, BAI_2, BAI_3, BAI_4, BAI_5, BAI_6, BAI_7, BAI_8, BAI_9, BAI_10]
