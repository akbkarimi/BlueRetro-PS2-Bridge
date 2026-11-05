# BlueRetro PS2 Bridge — WebApp v4.4.0

ابزار پیکربندی **دستگاه واقعی** BlueRetro PS2 Bridge از طریق Web Bluetooth مرورگر Chrome. این راهنما مربوط به نسخهٔ 4.4.0 است.
نسخه ۲ بازنویسی شده است: شبیه‌ساز ESP32 مجازی **کاملاً حذف شده** و کل اپ روی پروتکل واقعی فیرم‌ور (`att_cfg.c` و `mx_config.h`) سوار است.

## تغییرات نسبت به v1 (خلاصه)

| مشکل در v1 | راه‌حل در v2 |
|---|---|
| کمبو باکس‌ها بعد از نیم ثانیه می‌پریدند | علت: remount کل صفحه هر 600ms (تایمر `rev`). حذف شد — انتخاب‌ها می‌مانند |
| صفحه LED کار نمی‌کرد | پروتکل اشتباه بود؛ حالا اسلات LED واقعی (a0d/a0e، ۲۶ بایت) نوشته می‌شود — رنگ هر پورت + روشنایی + حالت auto، اعمال آنی و ماندگار در NVS |
| پیش‌نمایش صدا کار نمی‌کرد | کامند اشتباه (82) ارسال می‌شد؛ فیرم‌ور `0x15` می‌خواهد. حالا: پخش روی دستگاه (0x15) + پیش‌نمایش مرورگر (WebAudio) |
| اتصال از اندروید خطا می‌داد | Web Bluetooth بستر امن می‌خواهد؛ راهنمای داخلی + اسکریپت `dev:https` اضافه شد |
| حالت دسته‌ها | صفحه Ports جدید: خواندن/نوشتن dev_mode و acc_mode (a02/a03) + بیت ویبره |
| ESP32 مجازی | حذف کامل (شبیه‌ساز، دسته مجازی، shim) |

## تغییرات نسخهٔ 4.3 (تاریخچه)

| مورد | توضیح |
|---|---|
| سوییچ ویبره از صفحه «رنگ LED» حذف شد | به «تنظیمات پیشرفته ← پیکربندی خروجی» منتقل شد — همان‌جا که ابزار اصلی BlueRetro هم نگهش می‌دارد (a03 acc_mode بیت ۱) |
| صفحه Advance مثل ابزار اصلی BlueRetro بازنویسی شد | انتخاب بانک پیکربندی (banksel ‏a01[3]، بانک‌های ۰ تا ۳) + پیکربندی کلی (System/Multitap/Inquiry) + پیکربندی خروجی هر پورت با مقادیر نام‌دار dev_mode/acc_mode + لینک مستندات اصلی (blueretro.io و ویکی darthcloud/BlueRetro) |
| مقادیر اشتباه دراپ‌داون System اصلاح شد | قبلاً ۰=PS Classic و ۱=NES نشان می‌داد؛ مقدار واقعی فیرم‌ور enum سیم‌کشی است: ‏۰=خودکار، ۱=Parallel 1P، ۲=Parallel 2P، ۳=NES، … ۱۱=PSX، ۱۷=PS2 |
| دراپ‌داون Multitap کامل شد | حالت ۴ = Alt هم اضافه شد (enum فیرم‌ور: MT_NONE/1/2/DUAL/ALT) |
| BrSelect حالت disabled گرفت | سلکت‌های پورت وقتی آینه تنظیمات خوانده نشده غیرفعال می‌شوند |

> **سازگاری نسخه:** این WebApp برای پروتکل Firmware پروژه در نسخهٔ `mx-v6` توسعه یافته است. در صورت بروز خطا در خواندن یا نوشتن تنظیمات، نسخهٔ Firmware دستگاه را بررسی کنید. راهنمای Fix Pack قدیمی صرفاً برای سوابق است و دستورهای کپی آن برای نصب نسخهٔ فعلی کاربرد ندارند.

## اجرا

```bash
cd webapp
npm install
npm run dev        # → http://localhost:3000
```

- **دسکتاپ:** کروم → `http://localhost:3000` → «اتصال به دستگاه» → انتخاب `BlueRetro`
- **اندروید:** چون صفحه با IP شبکه باز می‌شود (بستر ناامن):
  1. در کروم گوشی بروید به `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
  2. آدرس `http://192.168.x.x:3000` را اضافه کنید → Enable → **Relaunch**
  3. بلوتوث و Location گوشی روشن باشد
  - راه تمیزتر: `npm run dev:https` (گواهی self-signed؛ هشدار کروم را بپذیرید)

## رفع فونت به‌هم‌ریخته OLED (پنل ۱۲۸×۳۲)

پنل شما ۳۲ پیکسل ارتفاع دارد ولی پیش‌فرض فیرم‌ور ۶۴ است. در اپ:
**نمایشگر OLED → Panel resolution → 128 × 32**
مقدار «فوراً» روی دستگاه اعمال می‌شود (`gfx_set_panel_h`) و در NVS ذخیره می‌شود — بعد از ریست هم می‌ماند. نیازی به فلش مجدد نیست.

## نقشه پروتکل (مطابق فیرم‌ور)

| کاراکتریستیک | نقش |
|---|---|
| a01 | global_cfg — ۴ بایت: system, multitap, inquiry, banksel |
| a02 / a03 | انتخاب پورت / dev_mode و acc_mode |
| a06 / a09 / a0c | نسخه API / نسخه فریمور / BDAddr |
| a07 | کامندها: `0x15` پیش‌نمایش ملودی (0..26)، `0x16` توقف، `0x37` خواب عمیق، `0x38` ریست ESP، `0x39` بازیابی کارخانه |
| a0d + a0e | اسلات‌های MX — انتخاب اسلات سپس خواندن/نوشتن blob: AUDIO(0) · OLED(1) · LED(2) · IDLE(3) · TIME(4) · FEATURES(6) |

### ساختار blob اسلات‌ها (mx_config.h)

```
AUDIO    (8B)  {enabled, volume, ev_power_on, ev_power_off, ev_reset, ev_bt_connect, ev_bt_disconnect, rsvd}
OLED   (6+nB)  {enabled, rotation, panel_h(32|64), notifications, touchpad_nav, page_cnt, pages[n]}
LED     (26B)  {auto_player, brightness, ports[8]{r,g,b}}
IDLE     (3B)  {mode(0..11), idle_timeout:u16le}
TIME     (6B)  {year:u16le, month, day, hour, minute}
FEATURES (1B)
```

ملودی‌ها ۰ تا ۲۶ — همان ترتیب جدول `melodies[]` در `ui.c`:
DEFAULT, SILENT, BOOT CHIME, MARIO UP, ZELDA, SONIC RING, COIN, ONE UP, GAME OVER, STAR POWER, MEGALOVIA, MII, WII SHOP, PSP BOOT, PS2 BOOT, DREAMCAST, SEGA, CHIPTUNE 1..3, BEEP3, SIREN, R2D2, DOORBELL, TADA, SUCCESS, ALERT

## ساختار پروژه

```
src/lib/br/
  constants.ts   UUIDs، کامندها، اسلات‌ها، حالت‌های اسکرین‌سیور
  protocol.ts    لایه پروتکل (خواندن/نوشتن a01..a0e)
  store.ts       Zustand: اتصال، آینه تنظیمات، لاگ GATT
  audio.ts       پیش‌نمایش ملودی در مرورگر (WebAudio)
  melodies.ts    ۲۷ ملودی (نُت‌ها)
  i18n.ts        دیکشنری دوزبانه FA/EN
src/components/br/
  BrApp.tsx      پوسته + صفحه اتصال (با تشخیص پشتیبانی Web Bluetooth)
  OledPreview.tsx پیش‌نمایش شماتیک OLED
  pages/         Home · Display · Sound · Colors · Ports · Shortcuts · Advance · System · Reference · Debug · Help
```

- صفحه Debug: لاگ زنده ترافیک GATT (hex dump) برای مقابله با فیرم‌ور.
- شناسه دیباگ: در حالت dev، استور روی `window.__br` در دسترس است.
