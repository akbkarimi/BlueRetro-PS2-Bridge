/**
 * BlueRetro MethyleneX — protocol constants v2
 * Matched 1:1 against the real firmware sources:
 *   main/bluetooth/att_cfg.c   (GATT handles, command IDs 0x01..0xDE)
 *   main/system/mx_config.h    (MX slot structs)
 *   main/system/ui.h, ui.c     (melodies, idle modes, info pages)
 */

/** Primary BLE service UUID */
export const BR_SERVICE_UUID = '56830f56-5180-fab0-314b-2fa176799a00'

/**
 * The 14 GATT characteristics. Index i → UUID suffix a0<i in hex>.
 * Firmware handle map: BR_GRP_HDL=0x40, char index = (handle-0x41)/2+1,
 * so a0d = MX config slot select, a0e = MX config blob.
 */
export const BR_UUID = [
  BR_SERVICE_UUID,                                        // 0 — service
  '56830f56-5180-fab0-314b-2fa176799a01', // 1  — global config (4 bytes)
  '56830f56-5180-fab0-314b-2fa176799a02', // 2  — port select (1 byte)
  '56830f56-5180-fab0-314b-2fa176799a03', // 3  — port data (dev_mode, acc_mode)
  '56830f56-5180-fab0-314b-2fa176799a04', // 4  — mem address select
  '56830f56-5180-fab0-314b-2fa176799a05', // 5  — mem data
  '56830f56-5180-fab0-314b-2fa176799a06', // 6  — API version (u8, deprecated)
  '56830f56-5180-fab0-314b-2fa176799a07', // 7  — command channel
  '56830f56-5180-fab0-314b-2fa176799a08', // 8  — OTA data
  '56830f56-5180-fab0-314b-2fa176799a09', // 9  — firmware version (utf8)
  '56830f56-5180-fab0-314b-2fa176799a0a', // 10 — memory card ctrl
  '56830f56-5180-fab0-314b-2fa176799a0b', // 11 — memory card data
  '56830f56-5180-fab0-314b-2fa176799a0c', // 12 — BDAddr (6 bytes, reversed)
  '56830f56-5180-fab0-314b-2fa176799a0d', // 13 — MX config slot select
  '56830f56-5180-fab0-314b-2fa176799a0e', // 14 — MX config blob (read/write)
] as const

export const DEVICE_NAME_PREFIX = 'BlueRetro'

/** Characteristic indices used by the app */
export const CH = {
  GLOBAL_CFG: 1,
  PORT_SEL: 2,
  PORT_DATA: 3,
  API_VER: 6,
  CFG_CMD: 7,
  OTA_DATA: 8,
  FW_VER: 9,
  BDADDR: 12,
  MX_SEL: 13,
  MX_DATA: 14,
} as const

/** Command IDs written to a07 — exactly att_cfg.c CFG_CMD_* */
export const CMD = {
  GET_ABI_VER: 0x01,
  GET_FW_VER: 0x02,
  GET_BDADDR: 0x03,
  GET_CFG_SRC: 0x05,
  GET_FW_NAME: 0x07,
  GET_HW_ID: 0x08,
  OTA_END: 0x5A,
  OTA_START: 0xA5,
  OTA_ABORT: 0xDE,
  AUDIO_PREVIEW: 0x15,      // [0x15, melody 0..26]
  AUDIO_PREVIEW_STOP: 0x16, // [0x16]
  AUDIO_SETTINGS: 0x17,     // read: 10 B response / write: [0x17, en, vol, sound×8]
  GET_CONTROLLER_STATE: 0x18, // write: [0x18, port], read: 17 B input snapshot
  SYS_DEEP_SLEEP: 0x37,
  SYS_RESET: 0x38,
  SYS_FACTORY: 0x39,
} as const

/** Controller monitor normalization and analog-trigger activation threshold. */
export const CONTROLLER_STICK_SCALE = 128
export const CONTROLLER_TRIGGER_MIN = 20

/** MX config slots (mx_config.h enum mx_cfg_slot) */
export const MX_SLOT = {
  AUDIO: 0,   // 8 B  {enabled, volume, ev_power_on, ev_power_off, ev_reset, ev_bt_connect, ev_bt_disconnect, rsvd}
  OLED: 1,    // 6+n B {enabled, rotation, panel_h, notifications, touchpad_nav, page_cnt, pages[n]}
  LED: 2,     // 26 B {auto_player, brightness, ports[8]{r,g,b}}
  IDLE: 3,    // 3 B  {mode, idle_timeout:u16le}
  TIME: 4,    // 6 B  {year:u16le, month, day, hour, minute}
  PAGES: 5,   // read-only for writes (firmware rejects)
  FEATURES: 6, // 1 B
  KEYS: 7,    // 2 B  {saver_combo, menu_combo} — configurable shortcut combos
  MAC: 8,     // 8 B  {magic, enabled, Bluetooth BR/EDR address[6]} — applied on reboot
} as const

/** Shortcut combo ids — must match mx_config.h MX_KEYS_COMBO_* */
export const KEY_COMBOS = [
  { id: 0, en: 'Home + D-Pad ↑', fa: 'Home + دکمه بالا' },
  { id: 1, en: 'Home + D-Pad ↓', fa: 'Home + دکمه پایین' },
  { id: 2, en: 'Home + D-Pad ←', fa: 'Home + دکمه چپ' },
  { id: 3, en: 'Home + D-Pad →', fa: 'Home + دکمه راست' },
  { id: 4, en: 'Share + Cross', fa: 'Share + ضربدر' },
  { id: 5, en: 'L1 + R1', fa: 'L1 + R1' },
  { id: 6, en: 'L2 + R2', fa: 'L2 + R2' },
  { id: 7, en: 'L3 + R3', fa: 'L3 + R3' },
] as const

/** Idle/screensaver modes — mx_config.h enum mx_idle_mode (order matters) */
export const IDLE_MODES = [
  { id: 0, en: 'Off', fa: 'خاموش' },
  { id: 1, en: 'Cube wireframe', fa: 'مکعب سه‌بعدی' },
  { id: 2, en: 'Starfield', fa: 'ستاره‌ها' },
  { id: 3, en: 'Tetris (PS symbols)', fa: 'تتریس (نمادهای PS)' },
  { id: 4, en: 'PS symbols float', fa: 'شناوری نمادهای PS' },
  { id: 5, en: 'Balls', fa: 'توپ‌ها' },
  { id: 6, en: 'Pong', fa: 'پینگ‌پنگ' },
  { id: 7, en: 'Analog clock', fa: 'ساعت عقربه‌ای' },
  { id: 8, en: 'Flip clock', fa: 'ساعت فلپی' },
  { id: 9, en: 'Rectangular clock', fa: 'ساعت مستطیلی' },
  { id: 10, en: 'PS logo', fa: 'لوگوی PS' },
  { id: 11, en: 'PlayStation wordmark', fa: 'لوگوی PlayStation' },
] as const

/** OLED info pages — ui.c page_id_t */
export const OLED_PAGES = [
  { id: 0, en: 'Status', fa: 'وضعیت' },
  { id: 1, en: 'Controllers', fa: 'دسته‌ها' },
  { id: 2, en: 'Battery', fa: 'باتری' },
  { id: 3, en: 'LED color', fa: 'رنگ LED' },
  { id: 4, en: 'Clock', fa: 'ساعت' },
] as const

/** Audio event fields inside the MX AUDIO slot (order = blob layout) */
export const AUDIO_EVENTS = [
  { field: 'powerOn', en: 'Power on', fa: 'روشن شدن' },
  { field: 'powerOff', en: 'Power off', fa: 'خاموش شدن' },
  { field: 'reset', en: 'Console reset', fa: 'ریست کنسول' },
  { field: 'connect', en: 'Controller connected', fa: 'اتصال دسته' },
  { field: 'disconnect', en: 'Controller disconnected', fa: 'قطع دسته' },
] as const

export type AudioEventField = (typeof AUDIO_EVENTS)[number]['field']

/** PS4/PS5 default player indicator colors */
export const PLAYER_COLORS = [
  { name: 'Blue', hex: '#2E6DB4' },
  { name: 'Red', hex: '#C43A3A' },
  { name: 'Green', hex: '#2EA043' },
  { name: 'Pink', hex: '#D6569B' },
] as const

/** Handy swatches for the LED editor */
export const LED_PALETTE = [
  '#000000', '#FFFFFF', '#2E6DB4', '#C43A3A', '#2EA043', '#D6569B',
  '#FF9800', '#FFEB3B', '#00BCD4', '#9C27B0', '#FF1744', '#00E676',
] as const

/** Firmware defaults (mx_config.c mx_config_defaults) — shown pre-connect */
export const FW_DEFAULTS = {
  audio: { enabled: 1, volume: 70, powerOn: 14, powerOff: 8, reset: 26, connect: 24, disconnect: 20 },
  oled: { enabled: 1, rotation: 0, panelH: 64, notifications: 1, touchpadNav: 1, pages: [0, 1, 2, 3, 4] },
  led: { autoPlayer: 1, brightness: 80 },
  idle: { mode: 1, timeoutSec: 30 },
  features: 0x7f,
} as const
