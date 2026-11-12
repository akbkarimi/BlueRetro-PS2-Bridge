/**
 * BlueRetro PS2 Bridge melodies — the 27 internal melodies from the project spec sheet
 * "ملودی‌ها و سیستم صدا" with the note table from the same sheet.
 * NOTE_D6 / NOTE_G6 are derived by octave doubling (sheet table stops at E6
 * but several melodies use D6/G6).
 */

export const NOTES: Record<string, number> = {
  NOTE_C4: 262,
  NOTE_D4: 294,
  NOTE_E4: 330,
  NOTE_F4: 349,
  NOTE_G4: 392,
  NOTE_A4: 440,
  NOTE_B4: 494,
  NOTE_C5: 523,
  NOTE_D5: 587,
  NOTE_E5: 659,
  NOTE_F5: 698,
  NOTE_G5: 784,
  NOTE_A5: 880,
  NOTE_B5: 988,
  NOTE_C6: 1047,
  NOTE_D6: 1175, // 2 × NOTE_D5 (derived)
  NOTE_E6: 1319,
  NOTE_G6: 1568, // 2 × NOTE_G5 (derived)
  NOTE_REST: 0,
}

export interface NoteStep {
  /** frequency in Hz, 0 = rest */
  f: number
  /** duration in ms */
  ms: number
}

export interface Melody {
  id: number
  name: string
  /** short English label for the UI */
  label: string
  /** category: 0 beeps/basic, 1 short, 2 long/game */
  cat: 0 | 1 | 2
  notes: NoteStep[]
}

const n = (name: string, ms: number): NoteStep => ({
  f: NOTES[name] ?? 0,
  ms,
})

/** Sheet rows 1..27 → melody ids 0..26 */
export const MELODIES: Melody[] = [
  { id: 0, name: 'DEFAULT', label: 'Default', cat: 0, notes: [n('NOTE_C5', 60)] },
  { id: 1, name: 'SILENT', label: 'Silent', cat: 0, notes: [] },
  { id: 2, name: 'BOOT_CHIME', label: 'Boot Chime', cat: 2, notes: [n('NOTE_C5', 80), n('NOTE_E5', 80), n('NOTE_G5', 120)] },
  { id: 3, name: 'MARIO_UP', label: 'Mario Up', cat: 2, notes: [n('NOTE_E5', 90), n('NOTE_G5', 90), n('NOTE_E6', 90), n('NOTE_C6', 90), n('NOTE_D6', 90), n('NOTE_G6', 160)] },
  { id: 4, name: 'ZELDA', label: 'Zelda', cat: 2, notes: [n('NOTE_A4', 80), n('NOTE_B4', 80), n('NOTE_F5', 80), n('NOTE_A5', 200)] },
  { id: 5, name: 'SONIC_RING', label: 'Sonic Ring', cat: 1, notes: [n('NOTE_G5', 60), n('NOTE_C6', 120)] },
  { id: 6, name: 'COIN', label: 'Coin', cat: 1, notes: [n('NOTE_B5', 60), n('NOTE_E6', 180)] },
  { id: 7, name: 'ONE_UP', label: '1-Up', cat: 1, notes: [n('NOTE_E5', 70), n('NOTE_G5', 70), n('NOTE_E6', 70), n('NOTE_C6', 70), n('NOTE_D6', 70), n('NOTE_G6', 70)] },
  { id: 8, name: 'GAME_OVER', label: 'Game Over', cat: 2, notes: [n('NOTE_C5', 150), n('NOTE_G4', 150), n('NOTE_E4', 200), n('NOTE_A4', 120), n('NOTE_B4', 120), n('NOTE_A4', 120), n('NOTE_G4', 160)] },
  { id: 9, name: 'STAR_POWER', label: 'Star Power', cat: 2, notes: [n('NOTE_C5', 60), n('NOTE_E5', 60), n('NOTE_G5', 60), n('NOTE_C6', 60), n('NOTE_E6', 60), n('NOTE_G6', 100)] },
  { id: 10, name: 'MEGALOVIA', label: 'Megalovia', cat: 2, notes: [n('NOTE_D4', 120), n('NOTE_D4', 120), n('NOTE_D5', 120), n('NOTE_A4', 120), n('NOTE_REST', 60), n('NOTE_G4', 120)] },
  { id: 11, name: 'MII', label: 'Mii Channel', cat: 2, notes: [n('NOTE_C5', 100), n('NOTE_E5', 100), n('NOTE_G5', 100), n('NOTE_E5', 100), n('NOTE_C5', 200)] },
  { id: 12, name: 'WII_SHOP', label: 'Wii Shop', cat: 2, notes: [n('NOTE_D5', 150), n('NOTE_G5', 150), n('NOTE_B5', 150), n('NOTE_A5', 150), n('NOTE_G5', 250)] },
  { id: 13, name: 'PSP_BOOT', label: 'PSP Boot', cat: 2, notes: [n('NOTE_G4', 100), n('NOTE_C5', 100), n('NOTE_E5', 100), n('NOTE_G5', 250)] },
  { id: 14, name: 'PS2_BOOT', label: 'PS2 Boot', cat: 2, notes: [n('NOTE_E4', 200), n('NOTE_B4', 200), n('NOTE_E5', 400)] },
  { id: 15, name: 'DREAMCAST', label: 'Dreamcast', cat: 2, notes: [n('NOTE_C5', 80), n('NOTE_F5', 80), n('NOTE_A5', 80), n('NOTE_F5', 80), n('NOTE_C5', 200)] },
  { id: 16, name: 'SEGA', label: 'Sega', cat: 2, notes: [n('NOTE_G4', 90), n('NOTE_C5', 90), n('NOTE_E5', 90), n('NOTE_G5', 90), n('NOTE_C6', 300)] },
  { id: 17, name: 'CHIPTUNE_1', label: 'Chiptune 1', cat: 1, notes: [n('NOTE_C5', 80), n('NOTE_D5', 80), n('NOTE_E5', 80), n('NOTE_F5', 80), n('NOTE_G5', 80), n('NOTE_A5', 80), n('NOTE_B5', 80), n('NOTE_C6', 160)] },
  { id: 18, name: 'CHIPTUNE_2', label: 'Chiptune 2', cat: 1, notes: [n('NOTE_A4', 100), n('NOTE_C5', 100), n('NOTE_E5', 100), n('NOTE_A5', 100), n('NOTE_E5', 100), n('NOTE_C5', 200)] },
  { id: 19, name: 'CHIPTUNE_3', label: 'Chiptune 3', cat: 1, notes: [n('NOTE_E5', 60), n('NOTE_D5', 60), n('NOTE_C5', 60), n('NOTE_D5', 60), n('NOTE_E5', 60), n('NOTE_G5', 120)] },
  { id: 20, name: 'BEEP3', label: 'Beep ×3', cat: 0, notes: [n('NOTE_C5', 90), n('NOTE_REST', 60), n('NOTE_C5', 90), n('NOTE_REST', 60), n('NOTE_C5', 90)] },
  { id: 21, name: 'SIREN', label: 'Siren', cat: 2, notes: [n('NOTE_C5', 150), n('NOTE_G4', 150), n('NOTE_C5', 150), n('NOTE_G4', 150)] },
  { id: 22, name: 'R2D2', label: 'R2-D2', cat: 1, notes: [n('NOTE_C6', 40), n('NOTE_E5', 30), n('NOTE_G5', 40), n('NOTE_C6', 30), n('NOTE_E6', 60)] },
  { id: 23, name: 'DOORBELL', label: 'Doorbell', cat: 1, notes: [n('NOTE_E5', 200), n('NOTE_C5', 350)] },
  { id: 24, name: 'TADA', label: 'Ta-Da', cat: 2, notes: [n('NOTE_C5', 80), n('NOTE_F5', 80), n('NOTE_G5', 80), n('NOTE_C6', 250)] },
  { id: 25, name: 'SUCCESS', label: 'Success', cat: 1, notes: [n('NOTE_C5', 70), n('NOTE_E5', 70), n('NOTE_G5', 70), n('NOTE_C6', 70)] },
  { id: 26, name: 'ALERT', label: 'Alert', cat: 0, notes: [n('NOTE_A5', 120), n('NOTE_REST', 40), n('NOTE_A5', 120)] },
]

export const MELODY_CATEGORIES = [
  { cat: 0 as const, en: 'Beeps & basics', fa: 'بیپ‌ها و پایه' },
  { cat: 1 as const, en: 'Short melodies', fa: 'ملودی‌های کوتاه' },
  { cat: 2 as const, en: 'Long melodies', fa: 'ملودی‌های بلند' },
]

export function melodyDuration(m: Melody): number {
  return m.notes.reduce((s, x) => s + x.ms, 0)
}

/** ASCII notes string like "C5 E5 G5" for compact display */
export function melodyNotesStr(m: Melody): string {
  if (m.notes.length === 0) return '—'
  return m.notes
    .map((x) => (x.f === 0 ? 'REST' : Object.entries(NOTES).find(([, v]) => v === x.f)?.[0]?.replace('NOTE_', '') ?? '?'))
    .join(' ')
}
