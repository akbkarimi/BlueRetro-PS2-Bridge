/** Bilingual EN/FA dictionary with RTL support */

export type Lang = 'en' | 'fa'

export const LANGS: { id: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'EN', dir: 'ltr' },
  { id: 'fa', label: 'فا', dir: 'rtl' },
]

const dict = {
  appName: { en: 'BlueRetro MethyleneX', fa: 'BlueRetro MethyleneX' },
  tagline: {
    en: 'Config tool for the real MethyleneX adapter over Web Bluetooth',
    fa: 'ابزار پیکربندی آداپتور واقعی MethyleneX از طریق Web Bluetooth',
  },
  connect: { en: 'Connect', fa: 'اتصال' },
  connectReal: { en: 'Connect to device (Bluetooth)', fa: 'اتصال به دستگاه (بلوتوث)' },
  connecting: { en: 'Connecting…', fa: 'در حال اتصال…' },
  connected: { en: 'Connected', fa: 'متصل' },
  notConnected: { en: 'Not connected', fa: 'متصل نیست' },
  disconnect: { en: 'Disconnect', fa: 'قطع اتصال' },
  firmware: { en: 'Firmware', fa: 'فریمور' },
  apiVersion: { en: 'API version', fa: 'نسخه API' },
  bdaddr: { en: 'BT address', fa: 'آدرس بلوتوث' },
  refresh: { en: 'Re-read config', fa: 'خواندن مجدد تنظیمات' },
  darkMode: { en: 'Dark mode', fa: 'تم تیره' },

  // connection help
  btMissing: { en: 'Web Bluetooth is not available here', fa: 'Web Bluetooth در این مرورگر در دسترس نیست' },
  btMissingWhy: {
    en: 'Web Bluetooth needs Chrome (desktop or Android) and a secure context (HTTPS or localhost).',
    fa: 'Web Bluetooth فقط در کروم (دسکتاپ/اندروید) و در بستر امن (HTTPS یا localhost) کار می‌کند.',
  },
  btFixDesktop: {
    en: 'Desktop fix: open this page with http://localhost:3000 in Chrome.',
    fa: 'راه‌حل دسکتاپ: همین صفحه را در کروم با http://localhost:3000 باز کنید.',
  },
  btFixAndroid: {
    en: 'Android fix: stop the dev server, start it with HTTPS (npx next dev --experimental-https), then open https://PC-IP:3000 in Google Chrome and accept the certificate warning. Bluetooth and Location must be on.',
    fa: 'راه‌حل اندروید: سرور را متوقف کنید و با HTTPS اجرا کنید (دستور: npx next dev --experimental-https)، سپس در Google Chrome آدرس https://IP-کامپیوتر:3000 را باز کنید و از صفحه هشدار، Advanced → Proceed را بزنید. بلوتوث و Location گوشی هم روشن باشد و حتماً از Google Chrome استفاده کنید (نه مرورگرهای دیگر).',
  },
  noDeviceSelected: { en: 'No device selected', fa: 'دستگاهی انتخاب نشد' },
  connectionLost: { en: 'Connection lost — reconnect', fa: 'اتصال قطع شد — دوباره وصل شوید' },
  readFailedHint: {
    en: 'Connected, but this config could not be read from the device — press Re-read config. If it keeps failing, the firmware on the device is older than this app: flash the mx-v6 firmware, then reconnect.',
    fa: 'اتصال برقرار است اما این بخش از دستگاه خوانده نشد — دکمه «خواندن مجدد تنظیمات» را بزنید. اگر باز هم خوانده نشد، یعنی فریمویر دستگاه قدیمی‌تر از این برنامه است: فریمویر mx-v6 را فلش کنید و دوباره وصل شوید.',
  },

  // pages
  home: { en: 'Home', fa: 'خانه' },
  display: { en: 'OLED Screen', fa: 'نمایشگر OLED' },
  sound: { en: 'Sound Config', fa: 'تنظیمات صدا' },
  colors: { en: 'Controller LED Colors', fa: 'رنگ LED دسته‌ها' },
  shortcuts: { en: 'Shortcuts', fa: 'میانبرها' },
  ports: { en: 'Ports', fa: 'پورت‌ها' },
  controllerTest: { en: 'Controller Test', fa: 'تست دسته بازی' },
  macSpoof: { en: 'MAC Address Spoof', fa: 'جعل آدرس MAC' },
  advance: { en: 'Advance Config', fa: 'تنظیمات پیشرفته' },
  system: { en: 'System Manager', fa: 'مدیریت سیستم' },
  reference: { en: 'Pinout & Sheets', fa: 'پین‌اوت و شیت‌ها' },
  debug: { en: 'Debug', fa: 'دیباگ' },
  help: { en: 'Help', fa: 'راهنما' },

  // home
  status: { en: 'Status', fa: 'وضعیت' },
  port: { en: 'Port', fa: 'پورت' },
  deviceInfo: { en: 'Device', fa: 'دستگاه' },
  quickActions: { en: 'Quick actions', fa: 'اقدامات سریع' },

  // display page
  displayDesc: {
    en: 'Panel, screensaver and info pages — stored in the firmware OLED/IDLE slots (NVS, applied live)',
    fa: 'پنل، اسکرین‌سیور و صفحات اطلاعاتی — در اسلات‌های OLED/IDLE فریمور (NVS، اعمال آنی)',
  },
  oledEnable: { en: 'OLED enabled', fa: 'OLED فعال' },
  resolution: { en: 'Panel resolution', fa: 'رزولوشن پنل' },
  resolutionHint: {
    en: '128×32 vs 128×64 — wrong value garbles the text. Applied instantly, saved to NVS.',
    fa: '۳۲×۱۲۸ در برابر ۶۴×۱۲۸ — مقدار اشتباه متن را به‌هم می‌ریزد. فوراً اعمال و در NVS ذخیره می‌شود.',
  },
  rotation: { en: 'Rotate 180°', fa: 'چرخش ۱۸۰ درجه' },
  notifications: { en: 'OLED notifications', fa: 'اعلان‌های OLED' },
  touchNav: { en: 'Touchpad navigation', fa: 'ناوبری تاچ‌پد' },
  infoPages: { en: 'Info pages (rotation order)', fa: 'صفحات اطلاعاتی (ترتیب چرخش)' },
  idleScreen: { en: 'Screensaver', fa: 'اسکرین‌سیور' },
  idleTimeout: { en: 'Idle timeout', fa: 'زمان بی‌کاری' },
  clockSlot: { en: 'Device clock (TIME page)', fa: 'ساعت دستگاه (صفحه TIME)' },
  syncClock: { en: 'Sync with this computer', fa: 'همگام با همین رایانه' },
  seconds: { en: 's', fa: 'ثانیه' },
  staticPreview: { en: 'Schematic preview', fa: 'پیش‌نمایش شماتیک' },
  off: { en: 'Off', fa: 'خاموش' },

  // sound page
  soundDesc: {
    en: 'Buzzer melodies per system event — 27 melodies, stored in the firmware AUDIO slot',
    fa: 'ملودی بازر برای هر رویداد سیستم — ۲۷ ملودی، ذخیره در اسلات AUDIO فریمور',
  },
  audioEnable: { en: 'Buzzer enabled', fa: 'بازر فعال' },
  event: { en: 'Event', fa: 'رویداد' },
  melody: { en: 'Melody', fa: 'ملودی' },
  preview: { en: 'Preview', fa: 'پیش‌نمایش' },
  previewDevice: { en: 'Play on device', fa: 'پخش روی دستگاه' },
  previewBrowser: { en: 'Play in browser', fa: 'پخش در مرورگر' },
  stop: { en: 'Stop', fa: 'توقف' },
  volume: { en: 'Volume', fa: 'بلندی صدا' },
  evPowerOn: { en: 'Power on', fa: 'روشن شدن' },
  evPowerOff: { en: 'Power off', fa: 'خاموش شدن' },
  evReset: { en: 'Console reset', fa: 'ریست کنسول' },
  evCtrlOn: { en: 'Controller connected', fa: 'اتصال دسته' },
  evCtrlOff: { en: 'Controller disconnected', fa: 'قطع دسته' },
  soundEventsHint: {
    en: 'Save writes the AUDIO slot; the buzzer applies it immediately and it survives reboots.',
    fa: 'ذخیره، اسلات AUDIO را می‌نویسد؛ بازر بلافاصله آن را اعمال می‌کند و پس از ریست هم می‌ماند.',
  },

  // colors page
  colorsDesc: {
    en: 'Per-port lightbar color and global brightness — stored in the firmware LED slot (NVS, applied live)',
    fa: 'رنگ lightbar هر پورت و روشنایی کلی — ذخیره در اسلات LED فریمور (NVS، اعمال آنی)',
  },
  autoPlayer: { en: 'Auto player colors', fa: 'رنگ خودکار بازیکن‌ها' },
  autoPlayerHint: {
    en: 'ON = BlueRetro assigns default player colors. OFF = the custom colors below are used.',
    fa: 'روشن = BlueRetro رنگ‌های پیش‌فرض بازیکن‌ها را می‌گذارد. خاموش = رنگ‌های سفارشی زیر اعمال می‌شوند.',
  },
  brightness: { en: 'Global brightness', fa: 'روشنایی کلی' },
  customColors: { en: 'Custom port colors', fa: 'رنگ‌های سفارشی پورت‌ها' },
  otherPorts: { en: 'Ports 3…8', fa: 'پورت‌های ۳ تا ۸' },
  saved: { en: 'Saved', fa: 'ذخیره شد' },
  rumble: { en: 'Rumble on port', fa: 'ویبره پورت' },

  // ports page
  portsDesc: {
    en: 'Raw per-port mode bytes (a02/a03): dev_mode and acc_mode of the wired adapter',
    fa: 'بایت‌های حالت هر پورت (a02/a03): dev_mode و acc_mode آداپتور',
  },
  devMode: { en: 'dev_mode', fa: 'dev_mode' },
  accMode: { en: 'acc_mode', fa: 'acc_mode' },
  rumbleBit: { en: 'Rumble bit (acc bit 1)', fa: 'بیت ویبره (بیت ۱ acc)' },

  // shortcuts page
  shortcutsDesc: {
    en: 'Pick which button combo opens the screensaver and which returns to the main menu — plus the fixed firmware shortcuts and touchpad gestures',
    fa: 'انتخاب کنید کدام ترکیب دکمه، اسکرین‌سیور را باز کند و کدام به منوی اصلی برگردد — به‌همراه میانبرهای ثابت فیرم‌ور و ژست‌های تاچ‌پد',
  },
  combo: { en: 'Combo', fa: 'ترکیب' },
  action: { en: 'Action', fa: 'عملکرد' },
  scHold: { en: 'Hold Home 3 s', fa: 'نگه‌داشتن Home سه ثانیه' },
  scPowerOff: { en: 'Power off console', fa: 'خاموش‌کردن کنسول' },
  scDouble: { en: 'Double press Home', fa: 'دوبار فشردن Home' },
  scReset: { en: 'Reset console', fa: 'ریست کنسول' },
  scPairing: { en: 'Home + Start', fa: 'Home + Start' },
  scPairingA: { en: 'Toggle pairing mode', fa: 'فعال/غیرفعال کردن Pairing' },
  scShare: { en: 'Home + Share', fa: 'Home + Share' },
  scShareA: { en: 'Disconnect this controller', fa: 'قطع اتصال همان دسته' },
  scSwipe: { en: 'Touchpad swipe ←→', fa: 'کشیدن روی تاچ‌پد چپ/راست' },
  scSwipeA: { en: 'Prev/next screensaver', fa: 'اسکرین‌سیور قبلی/بعدی' },
  scSwipeUD: { en: 'Touchpad swipe ↑↓', fa: 'کشیدن تاچ‌پد بالا/پایین' },
  scSwipeUDA: { en: 'Prev/next lightbar color', fa: 'رنگ lightbar قبلی/بعدی' },
  scTap: { en: 'Touchpad click', fa: 'کلیک تاچ‌پد' },
  scTapA: { en: 'Wake display / exit screensaver', fa: 'بیدار کردن نمایشگر یا خروج از اسکرین‌سیور' },
  gesture: { en: 'Gesture', fa: 'ژست' },
  keysSaver: { en: 'Screensaver mode combo', fa: 'ترکیب حالت اسکرین‌سیور' },
  keysSaverHint: {
    en: 'Press this combo on the pad to switch the OLED into screensaver mode right away',
    fa: 'این ترکیب را روی دسته بزنید تا OLED بلافاصله به حالت اسکرین‌سیور برود',
  },
  keysMenu: { en: 'Main menu mode combo', fa: 'ترکیب حالت منوی اصلی' },
  keysMenuHint: {
    en: 'Press this combo to wake the OLED and return to the main menu pages',
    fa: 'این ترکیب را بزنید تا OLED بیدار شود و به صفحات منوی اصلی برگردد',
  },
  keysApplies: {
    en: 'Saved in the firmware (NVS) and applied immediately — works offline, without the phone.',
    fa: 'در فیرم‌ور (NVS) ذخیره می‌شود و فوراً اعمال می‌شود — بدون گوشی هم کار می‌کند.',
  },
  fixedCombos: { en: 'Fixed shortcuts (always active)', fa: 'میانبرهای ثابت (همیشه فعال)' },
  scPageSwipe: { en: 'Touchpad swipe ←→ (menu)', fa: 'کشیدن روی تاچ‌پد چپ/راست (در منو)' },
  scPageSwipeA: { en: 'Prev/next info page', fa: 'صفحه اطلاعاتی قبلی/بعدی' },

  // system page
  systemDesc: {
    en: 'Reset and restore commands of the firmware (a07: 0x37 / 0x38 / 0x39)',
    fa: 'دستورهای ریست و بازیابی فیرم‌ور (a07: ‏0x37 / 0x38 / 0x39)',
  },
  otaTitle: {
    en: 'Firmware OTA Update',
    fa: 'به‌روزرسانی فریمور (OTA)',
  },
  otaDesc: {
    en: 'Update the device firmware over Bluetooth without a USB cable.',
    fa: 'به‌روزرسانی فریمور دستگاه از طریق بلوتوث و بدون کابل USB.',
  },
  otaSelectFile: {
    en: 'Select firmware .bin file',
    fa: 'انتخاب فایل فریمور با پسوند bin',
  },
  otaNoFile: {
    en: 'No firmware file selected.',
    fa: 'هنوز فایل فریموری انتخاب نشده است.',
  },
  otaStart: {
    en: 'Start update',
    fa: 'شروع به‌روزرسانی',
  },
  otaConfirmTitle: {
    en: 'Confirm firmware update',
    fa: 'تأیید به‌روزرسانی فریمور',
  },
  otaConfirmDesc: {
    en: 'Only continue if this firmware is intended for your device. Keep the device powered on and Bluetooth connected. Interrupting the transfer may leave the device unable to boot.',
    fa: 'فقط در صورتی ادامه دهید که این فریمور مخصوص دستگاه شما باشد. دستگاه را روشن و اتصال بلوتوث را برقرار نگه دارید. قطع انتقال ممکن است باعث شود دستگاه دیگر راه‌اندازی نشود.',
  },
  otaCancel: {
    en: 'Cancel update',
    fa: 'لغو به‌روزرسانی',
  },
  otaProgress: {
    en: 'Transfer progress',
    fa: 'پیشرفت انتقال',
  },
  otaWarning: {
    en: 'Keep the device powered on and do not disconnect Bluetooth during the update. Use only firmware intended for this hardware.',
    fa: 'در طول به‌روزرسانی دستگاه را روشن نگه دارید و بلوتوث را قطع نکنید. فقط از فریمور مخصوص همین سخت‌افزار استفاده کنید.',
  },
  otaSuccess: {
    en: 'Firmware transfer completed. The device is restarting.',
    fa: 'انتقال فریمور کامل شد. دستگاه در حال راه‌اندازی مجدد است.',
  },
  otaCancelled: {
    en: 'Firmware update cancelled.',
    fa: 'به‌روزرسانی فریمور لغو شد.',
  },
  otaFailed: {
    en: 'Firmware update failed',
    fa: 'به‌روزرسانی فریمور ناموفق بود',
  },
  otaInvalidFileFormat: {
    en: 'Select a .bin firmware file.',
    fa: 'یک فایل فریمور با پسوند bin انتخاب کنید.',
  },
  otaInvalidFileSize: {
    en: 'Firmware file is empty or exceeds the 1 MiB limit.',
    fa: 'فایل فریمور خالی است یا از محدودیت ۱ مگابایت بیشتر است.',
  },
  otaHardwareMismatch: {
    en: 'Firmware hardware type does not match the connected device (HW1/HW2).',
    fa: 'نوع سخت‌افزار فریمور با دستگاه متصل مطابقت ندارد (HW1/HW2).',
  },
  otaLegacyFirmware: {
    en: 'Legacy firmware detected (ABI 2). Select the board hardware manually.',
    fa: 'فریمور قدیمی (ABI 2) شناسایی شد. نوع سخت‌افزار برد را دستی انتخاب کنید.',
  },
  otaSelectHardware: {
    en: 'Select the hardware type for this board.',
    fa: 'نوع سخت‌افزار این برد را انتخاب کنید.',
  },
  otaChooseHardware: {
    en: 'Choose hardware type…',
    fa: 'انتخاب نوع سخت‌افزار…',
  },
  otaNotConnected: {
    en: 'Connect to the device before updating firmware.',
    fa: 'برای به‌روزرسانی فریمور ابتدا به دستگاه وصل شوید.',
  },
  otaConnectionLost: {
    en: 'Bluetooth connection was lost during the update. Check the device before retrying.',
    fa: 'ارتباط بلوتوث هنگام به‌روزرسانی قطع شد. پیش از تلاش مجدد، وضعیت دستگاه را بررسی کنید.',
  },

  consoleReset: { en: 'Reset console', fa: 'ریست کنسول' },
  factoryReset: { en: 'Factory reset', fa: 'بازگشت به تنظیمات کارخانه' },
  deepSleep: { en: 'Deep sleep', fa: 'خواب عمیق' },
  espReset: { en: 'ESP32 reset', fa: 'ریست ESP32' },
  factoryHint: {
    en: 'Erases NVS (including MX slots) and restores defaults. The device reboots.',
    fa: 'NVS (شامل اسلات‌های MX) پاک و پیش‌فرض‌ها بازیابی می‌شود. دستگاه ریبوت می‌شود.',
  },
  deepSleepHint: {
    en: 'Puts the ESP32 into deep sleep — wake by resetting the board.',
    fa: 'ESP32 به خواب عمیق می‌رود — بیدارسازی با ریست کردن برد.',
  },
  confirm: { en: 'Are you sure?', fa: 'مطمئن هستید؟' },
  yes: { en: 'Yes', fa: 'بله' },

  // advance page
  advanceDesc: {
    en: 'Original BlueRetro config fields (a01 global + a02/a03 output) plus the MX FEATURES byte',
    fa: 'فیلدهای پیکربندی اصلی BlueRetro (a01 کلی + a02/a03 خروجی) به‌همراه بایت FEATURES مال MX',
  },
  systemCfg: { en: 'System mode', fa: 'حالت سیستم' },
  multitap: { en: 'Multitap', fa: 'مالتی‌تپ' },
  featuresByte: { en: 'FEATURES bits (raw)', fa: 'بیت‌های FEATURES (خام)' },
  featuresHint: {
    en: 'Reserved feature flags of the firmware — change only if you know the bit map.',
    fa: 'پرچم‌های رزروشده قابلیت‌های فیرم‌ور — فقط اگر نقشه بیت‌ها را می‌دانید تغییر دهید.',
  },
  inquiryMode: { en: 'Inquiry mode', fa: 'حالت Inquiry' },
  configSel: { en: 'Config selection (banksel)', fa: 'انتخاب پیکربندی (banksel)' },
  configSelHint: {
    en: 'Bank 0 = factory hw config · banks 1–3 = custom banks. Same field the original web config uses (a01[3]).',
    fa: 'بانک ۰ = پیکربندی کارخانه · بانک‌های ۱ تا ۳ = بانک‌های سفارشی. همان فیلد ابزار اصلی BlueRetro (a01[3]).',
  },
  bankDbgHint: {
    en: 'Current value is 0xDB (debug bank) — pick a bank to leave debug mode.',
    fa: 'مقدار فعلی 0xDB (بانک دیباگ) است — برای خروج از حالت دیباگ یک بانک انتخاب کنید.',
  },
  activeBank: { en: 'Active bank', fa: 'بانک فعال' },
  bankDefault: { en: 'Factory default', fa: 'پیش‌فرض کارخانه' },
  bankCustom: { en: 'Custom bank', fa: 'بانک سفارشی' },
  globalCfgTitle: { en: 'Global config', fa: 'پیکربندی کلی' },
  outCfgTitle: { en: 'Output config', fa: 'پیکربندی خروجی' },
  outCfgHint: {
    en: 'Same per-port fields as the original BlueRetro web config (a02 select + a03 data).',
    fa: 'همان فیلدهای هر پورت در ابزار اصلی BlueRetro (a02 انتخاب + a03 داده).',
  },
  devModeName: { en: 'Device mode', fa: 'حالت دستگاه' },
  accModeName: { en: 'Accessory mode', fa: 'حالت متعلقات' },
  devPad: { en: 'Gamepad', fa: 'دسته بازی' },
  devPadAlt: { en: 'Gamepad (alt)', fa: 'دسته بازی (جایگزین)' },
  devKb: { en: 'Keyboard', fa: 'کیبورد' },
  devMouse: { en: 'Mouse', fa: 'موس' },
  accNone: { en: 'None', fa: 'هیچ' },
  accMem: { en: 'Memory card', fa: 'کارت حافظه' },
  accRumble: { en: 'Rumble', fa: 'ویبره' },
  accBoth: { en: 'Memory card + Rumble', fa: 'کارت حافظه + ویبره' },
  mtNone: { en: 'Off', fa: 'خاموش' },
  mtSlot1: { en: 'Port 1', fa: 'پورت ۱' },
  mtSlot2: { en: 'Port 2', fa: 'پورت ۲' },
  mtDual: { en: 'Both ports', fa: 'هر دو پورت' },
  mtAlt: { en: 'Alt mode', fa: 'حالت جایگزین' },
  inqAuto: { en: 'Auto', fa: 'خودکار' },
  inqManual: { en: 'Manual', fa: 'دستی' },
  rawBytes: { en: 'raw', fa: 'خام' },
  rumbleMoved: {
    en: 'The per-port rumble toggle moved to Advance Config → Output config (where the original BlueRetro tool keeps it).',
    fa: 'سوییچ ویبره هر پورت به «تنظیمات پیشرفته ← پیکربندی خروجی» منتقل شد (جایی که ابزار اصلی BlueRetro هم نگهش می‌دارد).',
  },
  origDocs: { en: 'Original BlueRetro project', fa: 'پروژه اصلی BlueRetro' },
  origDocsHint: {
    en: 'This page mirrors the original BlueRetro web config (blueretro.io) on the MethyleneX protocol. Documentation lives in the original GitHub repo wiki.',
    fa: 'این صفحه همان ابزار اصلی پیکربندی BlueRetro (blueretro.io) است که روی پروتکل MethyleneX بازسازی شده. مستندات در ویکی مخزن اصلی گیت‌هاب است.',
  },

  // reference page
  refDesc: {
    en: 'ESP32 pinout and spec-sheet tables used by this build',
    fa: 'پین‌اوت ESP32 و جدول‌های شیت مشخصات استفاده‌شده در این ساخت',
  },
  gpio: { en: 'ESP32 IO', fa: 'ESP32 IO' },
  direction: { en: 'Direction', fa: 'جهت' },
  function: { en: 'Function', fa: 'عملکرد' },
  note: { en: 'Note', fa: 'یادداشت' },

  mainMenu: { en: 'Main menu', fa: 'منوی اصلی' },

  // shortcuts extras
  oledState: { en: 'OLED state', fa: 'حالت OLED' },

  // debug
  gattLog: { en: 'GATT traffic log', fa: 'لاگ ترافیک GATT' },
  clear: { en: 'Clear', fa: 'پاک کردن' },
  noTraffic: { en: 'no traffic yet', fa: 'هنوز ترافیکی نیست' },
  all: { en: 'all', fa: 'همه' },
  read: { en: 'read', fa: 'خواندن' },
  write: { en: 'write', fa: 'نوشتن' },
  events: { en: 'events', fa: 'رویدادها' },

  // controller input monitor
  controllerTestDesc: {
    en: 'Live view of controller buttons, sticks and analog triggers received by the firmware',
    fa: 'نمایش زنده دکمه‌ها، آنالوگ‌ها و تریگرهایی که فریمور از دسته دریافت می‌کند',
  },
  controllerMonitor: { en: 'Monitor input', fa: 'پایش ورودی دسته' },
  controllerMonitoring: { en: 'Monitoring active', fa: 'پایش فعال است' },
  controllerInactive: { en: 'Monitoring stopped', fa: 'پایش متوقف است' },
  controllerExperimental: { en: 'Experimental firmware feature', fa: 'قابلیت آزمایشی فریمور' },
  controllerExperimentalDesc: {
    en: 'This page reads a compact controller snapshot over BLE. It does not inject input or change controller mappings.',
    fa: 'این صفحه وضعیت لحظه‌ای دسته را از طریق BLE می‌خواند؛ ورودی تزریق نمی‌کند و نگاشت دکمه‌ها را تغییر نمی‌دهد.',
  },
  controllerRaw: { en: 'Raw button mask', fa: 'ماسک خام دکمه‌ها' },
  controllerTriggers: { en: 'Analog triggers', fa: 'تریگرهای آنالوگ' },
  controllerPressed: { en: 'pressed', fa: 'فشرده' },
  controllerWaiting: { en: 'Waiting for controller input…', fa: 'در انتظار دریافت ورودی از دسته…' },
  controllerReceived: { en: 'Controller input received', fa: 'ورودی دسته دریافت می‌شود' },
  controllerStateUnsupported: {
    en: 'This firmware does not expose controller monitoring yet. Build and flash the updated firmware, then reconnect.',
    fa: 'فریمور فعلی هنوز پایش دسته را ارائه نمی‌کند. فریمور به‌روزشده را بسازید و فلش کنید، سپس دوباره متصل شوید.',
  },

  // MAC spoofing
  macSpoofDesc: {
    en: 'Set a custom Bluetooth BR/EDR address for compatibility with devices such as PlayStation 3. The change is applied after reboot.',
    fa: 'تنظیم آدرس سفارشی Bluetooth BR/EDR برای سازگاری با دستگاه‌هایی مانند PlayStation 3؛ تغییر پس از راه‌اندازی مجدد اعمال می‌شود.',
  },
  macSpoofEnable: { en: 'Enable MAC spoofing', fa: 'فعال‌سازی جعل MAC' },
  macSpoofAddress: { en: 'Spoofed Bluetooth address', fa: 'آدرس بلوتوث جایگزین' },
  macSpoofPresets: { en: 'Presets', fa: 'مقادیر آماده' },
  macSpoofUseCurrent: { en: 'Use current address', fa: 'استفاده از آدرس فعلی' },
  macSpoofValid: { en: 'Valid unicast address', fa: 'آدرس Unicast معتبر' },
  macSpoofMulticast: { en: 'Multicast addresses cannot be used as a Bluetooth device address.', fa: 'آدرس‌های Multicast را نمی‌توان به‌عنوان آدرس دستگاه بلوتوث استفاده کرد.' },
  macSpoofEmpty: { en: 'Empty address', fa: 'آدرس خالی' },
  macSpoofInvalid: { en: 'Enter six hexadecimal bytes', fa: 'شش بایت هگزادسیمال وارد کنید' },
  macSpoofUnrepresentable: { en: 'This address cannot be mapped to a valid ESP32 base MAC. Choose another unicast address.', fa: 'این آدرس به یک Base MAC معتبر برای ESP32 تبدیل نمی‌شود؛ یک آدرس Unicast دیگر انتخاب کنید.' },
  macSpoofReboot: {
    en: 'After saving, wait at least 2 seconds, then power-cycle the adapter. The Bluetooth controller address is selected during firmware startup.',
    fa: 'پس از ذخیره، دست‌کم ۲ ثانیه صبر کنید و سپس آداپتور را خاموش و روشن کنید. آدرس کنترلر بلوتوث هنگام راه‌اندازی فریمور انتخاب می‌شود.',
  },
  macSpoofSaved: { en: 'MAC spoof settings saved', fa: 'تنظیمات جعل MAC ذخیره شد' },
  macSpoofUnsupported: {
    en: 'This firmware does not support the MAC configuration slot. Build and flash the updated firmware, then reconnect.',
    fa: 'فریمور فعلی اسلات تنظیم MAC را پشتیبانی نمی‌کند. فریمور به‌روزشده را بسازید و فلش کنید، سپس دوباره متصل شوید.',
  },
  macSpoofCurrent: { en: 'Current Bluetooth address', fa: 'آدرس فعلی بلوتوث' },
  macSpoofConfigured: { en: 'Configured address', fa: 'آدرس تنظیم‌شده' },

  // misc
  save: { en: 'Save', fa: 'ذخیره' },
  savedToast: { en: 'Saved to device', fa: 'روی دستگاه ذخیره شد' },
  writeFailed: { en: 'Write failed', fa: 'نوشتن ناموفق بود' },
  on: { en: 'ON', fa: 'روشن' },
  offLabel: { en: 'OFF', fa: 'خاموش' },
  needConnect: { en: 'Connect to the device first', fa: 'ابتدا به دستگاه وصل شوید' },
} as const

export type DictKey = keyof typeof dict

export function makeT(lang: Lang) {
  return (key: DictKey): string => {
    const row = dict[key] as { en: string; fa: string } | undefined
    if (!row) return key
    return row[lang]
  }
}

export type T = ReturnType<typeof makeT>
