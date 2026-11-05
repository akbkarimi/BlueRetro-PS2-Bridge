# MethyleneX Firmware mx-v6 — Fix Pack

> **LEGACY / HISTORICAL DOCUMENTATION — DO NOT FOLLOW THESE COPY OR INSTALL COMMANDS FOR THE CURRENT `BlueRetro-PS2-Bridge` REPOSITORY.**
>
> This document describes an older directory layout and a separate firmware fix-pack archive. It is retained for historical reference only. Do not copy these files into the current project.

# بستهٔ اصلاحات فیرم‌ور MethyleneX نسخهٔ mx-v6

> Files in this pack OVERWRITE the same files in your working tree
> (`BlueRetro-methyleneX/`), then a **full clean build** is required.
>
> فایل‌های این بسته، فایل‌های هم‌مسیر را در شاخهٔ کاری شما جایگزین می‌کنند؛
> پس از کپی، **بیلد کاملاً تمیز** لازم است.

---

## ۱) What is fixed in mx-v6 — این نسخه چه چیزهایی را درست می‌کند

### Touch / تاچ‌پد
1. **Swipe ← → now brings ALL info pages** — در حالت روشن (منو)، کشیدن روی تاچ‌پد به چپ/راست بین همهٔ صفحات اطلاعاتی (Status / Controllers / Battery / Lightbar / Clock) جابه‌جا می‌شود.
2. **Swipe ↑ ↓ changes the lightbar color** — and the change is now pushed **instantly** to every connected pad (`manager_send_pad_colors()` right after the swipe; the manager poll remains as a backstop and also watches a new MX-LED generation counter).
3. **Per-port colors can't cross ports anymore** (kept from v5) — the color targets the pad you swiped on (`touch.src`), and `ps_ctrl_color_get()` prefers the per-port MX LED slot.
4. **Standalone mode fixed** — colors change even when **no console is connected** (the adapter previously dropped PLAYER-LED feedback in `WIRED_AUTO` state; now it passes LED feedback straight to the pads).
5. **OLED "LIGHTBAR" page now shows the real per-port colors** (P1/P2 hex from the LED slot) instead of the stale UI copy.

### Clock / ساعت
6. **Big 7-segment clock digits** — new `gfx_big_hhmm()` / `gfx_big_num()` renderers fill the **entire 128-px width** of the OLED:
   - `TIME` info page (main menu) — ساعت بزرگ + خط تاریخ زیر آن؛
   - `CLOCK RECT` screensaver — ساعت بزرگ تمام‌عرض؛
   - `CLOCK FLIP` screensaver — دو کارت بزرگ ساعت/دقیقه.

### Shortcuts / میانبرها
7. **Configurable shortcut combos** — new MX **KEYS** slot (slot 7, 2 bytes, NVS):
   - `saver_combo` — the combo that puts the OLED into **screensaver mode**;
   - `menu_combo` — the combo that returns to the **main menu**.
   - 8 combos available (see the WebApp Shortcuts page): Home+D-Pad ↑/↓/←/→, Share+Cross, L1+R1, L2+R2, L3+R3.
   - **Defaults:** Home + D-Pad → = screensaver · Home + D-Pad ← = main menu.
   - The fixed shortcuts are unchanged: hold Home 3 s = power off · double-tap Home = reset · Home+Start = pairing · Home+Share = disconnect.

### Kept from v5 / حفظ شده از نسخهٔ قبل
- DS4 battery high-nibble fix, per-port LED slot priority, deferred NVS flush, plain-GPIO port LEDs (IO2/IO4), att_cfg legacy aliases (0x52/0x53).

---

## ۲) Historical copy instructions — OBSOLETE / دستورهای قدیمی و منسوخ

```bash
cd ~/blueretro/BlueRetro-methyleneX        # your working tree (adjust path)
unzip -o ~/Downloads/BlueRetro-methyleneX-fw-fixes-v6.zip -d /tmp/fw6
cp -r /tmp/fw6/BlueRetro-methyleneX-fw-v6/* .
```

Files replaced: `CMakeLists.txt` (version → mx-v6), `configs/hw2/playstation`,
`main/bluetooth/att_cfg.c`, `main/bluetooth/hidp/ps.c`,
`main/adapter/{adapter,config,shortcut}.c`, `main/adapter/wireless/ps.c`,
`main/system/{ui,ui_gfx,ui_saver,mx_config,manager}.{c,h}`

---

> **Historical example only:** The commands below refer to the old directory layout and old fix-pack. Do not execute them against the current repository.
>
> **نمونهٔ تاریخی:** دستورهای زیر مربوط به ساختار پوشه‌ها و بستهٔ اصلاحی قدیمی هستند؛ آن‌ها را برای مخزن فعلی اجرا نکنید.

## ۳) Build (Debian 13) — بیلد قدیمی

⚠️ After copying a new pack **always fullclean** — a dirty `sdkconfig` makes the
build silently ignore the fragment values:

```bash
cd ~/blueretro/BlueRetro-methyleneX
source ~/esp-idf/export.sh            # or your IDF export path
export BR_SYS=_playstation
idf.py -D IDF_TARGET=esp32 \
       -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/hw2/playstation" \
       fullclean
rm -f sdkconfig
idf.py -D IDF_TARGET=esp32 \
       -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/hw2/playstation" \
       reconfigure build
```

---

## ۴) Historical flash instructions — دستورهای فلش قدیمی

```bash
sudo systemctl stop ModemManager 2>/dev/null   # Debian grabs /dev/ttyUSB0 otherwise
idf.py -p /dev/ttyUSB0 -b 115200 flash
# if the chip does not auto-reset into download mode:
#   hold BOOT, press EN, release BOOT, then:
#   idf.py -p /dev/ttyUSB0 -b 115200 --before no_reset flash
```

The 4 MB partition layout from v4/v5 is unchanged (factory/ota_0/ota_1 @
0x10000/0x110000/0x210000, storage 0xF0000, ends exactly at 0x400000).

---

## ۵) Verify — بررسی

1. Reconnect the WebApp → header shows **`mx-v6`** (firmware version from a09).
2. Swipe ← → on the touchpad in the menu: pages rotate (Status → Controllers → Battery → Lightbar → Clock).
3. Swipe ↑ / ↓: lightbar color steps through RED → ORANGE → … → WHITE, **instantly**, per pad.
4. WebApp → Colors: pick a color for Port 1 → the pad's lightbar changes **immediately** (no reconnect needed).
5. WebApp → Shortcuts: two comboboxes (Screensaver mode / Main menu) — pick combos; press them on the pad.
6. Clock page & clock screensavers: digits fill the full 128-px width.
7. Hardware port LEDs: P1 = IO2, P2 = IO4 blink on connection (plain-GPIO path, kept from v5).
