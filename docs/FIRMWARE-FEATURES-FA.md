# BlueRetro PS2 Bridge — ویژگی‌های Firmware

این پچ سورس فورک `akbkarimi/BlueRetro` را طوری تغییر می‌دهد که **همه موارد شیت‌های فایل مشخصات (blueretro-corrected.xlsx) برقرار شود** و WebApp بتواند از طریق سرویس GATT موجود (`56830f56-5180-fab0-314b-2fa176799a00`، کاراکتریستیک‌های a01…a0e) تمام تنظیمات را زنده روی دستگاه بنویسد.

## چه چیزهایی اضافه/تغییر کرد؟

### ۱) ملودی‌ها — شیت «ملودی‌ها و سیستم صدا» ✅
- هر **۲۷ ملودی** با همان نت‌ها و نام‌های اکسل (`DEFAULT`, `BOOT CHIME`, `MARIO UP`, `ZELDA`, `SONIC RING`, `COIN`, `ONE UP`, `GAME OVER`, `STAR POWER`, `MEGALOVIA`, `MII`, `WII SHOP`, `PSP BOOT`, `PS2 BOOT`, `DREAMCAST`, `SEGA`, `CHIPTUNE 1/2/3`, `BEEP3`, `SIREN`, `R2D2`, `DOORBELL`, `TADA`, `SUCCESS`, `ALERT`) در `main/system/ui.c`.
- رویدادهای صدا به ۸ مورد رسید: بوت، شروع/پایان pairing، خطا، اتصال، قطع اتصال، **خاموش‌کردن کنسول**، **ریست کنسول** (دو مورد آخر جدید).
- **صدای خاموش/ریست** قبل از قطع پالس در `manager.c` پخش می‌شود (بوزر با کنسول خاموش می‌شود، پس ملودی اول پخش و بعد پالس ارسال می‌شود).
- فرمان `0x15` (PreviewMelody) و `0x16` (PreviewStop) که در فورک استاب بودند، به موتور صدا وصل شدند؛ `0x17` (AudioSettings) هم خواندن/نوشتن کامل شد.
- اسلات MX صدا (`MX_SLOT_AUDIO` = 0) اعتبارسنجی می‌شود (هر رویداد < ۲۷) و بعد از هر نوشتن BLE، زنده در موتور صدا اعمال می‌شود (`ui_mx_apply`).

### ۲) اسکرین‌سیورها — شیت «اسکرین‌سیورها» ✅
هر ۱۱ حالت اکسل + اسکرین‌سیور قبلی PAD (چرخش لوگوها) = **۱۲ اسکرین‌سیور** در `ui_saver.c`:
`CUBE`, `STARS`, `TETRIS`, `PS SYMBOLS`, `BALLS`, `PONG`, `CLOCK ANALOG`, `CLOCK FLIP`, `CLOCK RECT`, `LOGO PS`, `LOGO PLAYSTATION`, `PAD`.

- دو بیت‌مپ ۵۱۲ بایتی لوگوها از اکسل در `main/system/ui_logos.h` آورده شد.
- ساعت‌ها از اسلات زمان MX (`MX_SLOT_TIME`) می‌خوانند.
- شماره‌گذاری `MX_IDLE_*` در `mx_config.h` گسترده شد: `MX_IDLE_LOGO_PS=10`, `MX_IDLE_LOGO_PLAYSTATION=11` و حالت MX مستقیماً به اسکرین‌سیور معادل نگاشت می‌شود (حالت N → saver N-1).
- انتخاب اسکرین‌سیور از WebApp از طریق اسلات `MX_SLOT_IDLE` انجام و زنده اعمال می‌شود.

### ۳) نمایشگر — شیت «در معماری نمایشگر» ✅
- **ارتفاع پنل runtime**: بافر همیشه ۱۲۸×۶۴ تخصیص می‌یابد و `gfx_set_panel_h(32/64)` + بازپیکربندی SSD1306 اجازه می‌دهد WebApp از طریق `MX_SLOT_OLED.panel_h` بین **۱۲۸×۳۲ و ۱۲۸×۶۴** سوییچ کند (بدون کامپایل مجدد).
- **چرخش ۱۸۰ درجه** از اسلات OLED (`rotation`) پشتیبانی می‌شود (`oled_apply_geometry`).
- **صفحات اطلاعاتی**: STATUS، CONTROLLERS، BATTERY، COLOR (RGB HEX)، TIME — فهرست صفحات فعال از `MX_SLOT_OLED.pages` خوانده می‌شود؛ با **Home+D-Pad بالا/پایین** جابه‌جا می‌شوند.
- **وضعیت اتصال و باتری**: صفحه BATTERY و Toast باتری برای P1/P2.

### ۴) میانبرهای دسته‌ها — شیت «میانبرهای دسته‌ها» ✅
ماژول جدید `main/adapter/shortcut.c` (هوک در `adapter_bridge` کنار `sys_macro_hdl`):
| ترکیب | عملکرد |
|---|---|
| نگه‌داشتن Home سه ثانیه | خاموش‌کردن کنسول (با صدای Power Off) |
| دوبار فشردن Home (دو تپ < ۴۰۰ms) | ریست کنسول (با صدای Reset) |
| Home + Start (Options) | فعال/غیرفعال کردن Pairing (Inquiry) |
| Home + Share | قطع اتصال همان دسته |
| Home + D-Pad راست/چپ | اسکرین‌سیور بعدی/قبلی |
| Home + D-Pad بالا/پایین | صفحه OLED بعدی/قبلی |

- فقط برای دسته‌ها اجرا می‌شود (BT_PS/BT_PS3/BT_WII/BT_SW/BT_SW2) و با ماکروهای قدیمی (L1+R1+…) تداخلی ندارد.
- کلیک Touchpad همچنان نمایشگر را بیدار می‌کند.

### ۵) حرکت روی Touchpad — شیت «حرکت روی Touchpad» ✅
`ui_touch_feed` حالا جهت سوایپ را به UI می‌فرستد و UI بسته به حالت نمایشگر تصمیم می‌گیرد:
| حالت | سوایپ راست→چپ | سوایپ چپ→راست | بالا | پایین |
|---|---|---|---|---|
| اسکرین‌سیور | اسکرین‌سیور بعدی | اسکرین‌سیور قبلی | رنگ بعدی | رنگ قبلی |
| فعال | نمایش باتری دسته ۱ | نمایش باتری دسته ۲ | رنگ بعدی | رنگ قبلی |

### ۶) باتری ✅
- سطح باتری از دو مسیر جمع می‌شود: خواندن **BAS (Battery Level)** هنگام init دسته‌های BLE مثل DS5 (`att_hid.c`) و **بایت ۲۹ گزارش وضعیت DS4** برای دسته‌های Classic (`hidp/ps.c`).
- در `ui_battery_set/get` کش می‌شود و در صفحه BATTERY / Toast سوایپ نمایش می‌یابد (0xFF = ناشناخته).

### ۷) پالت رنگ PS4/PS5 — شیت «پالت رنگ» ✅
- `ps_ctrl_color_get` (در `config.c`) حالا اولویت‌بندی کامل دارد:
  1. **چشمک موقت قرمز→نارنجی** هنگام اتصال هر دسته (۳۰۰ms + ۳۰۰ms) — تایمر `esp_timer` در `hidp/ps.c` رنگ را روی دسته رفرش می‌کند؛
  2. رنگ سراسری سفارشی UI (پریست‌های تاچ‌پد / WebApp)؛
  3. **حالت دستی MX LED**: رنگ مستقل هر پورت از `MX_SLOT_LED.ports[8]`؛
  4. حالت خودکار (`auto_player=1`): رنگ‌های پیش‌فرض بازیکن‌ها (همان رفتار قبلی).
- نوشتن اسلات LED از WebApp بدون ریست اعمال می‌شود.

### ۸) یکپارچه‌سازی WebApp ✅
- `MX_SLOT_*` (Ctrl = کاراکتریستیک **a0d**، Data = **a0e**، پروتکل select-slot + write/read blob و prepare-write چندبخشی) به UI/صدا/رنگ/نمایشگر **زنده** وصل شد (`ui_mx_apply` بعد از هر نوشتن موفق).
- ترتیب init اصلاح شد: `nvs → mx_config_init → ui_init → ui_mx_apply` تا دستگاه با تنظیمات WebApp بوت شود.
- نسخه‌ی blobهای NVS تنظیمات UI به ۳/۲ ارتقا یافت (ساختار sound[] جدید) — باتری تنظیمات قدیمی نادیده گرفته می‌شود و پیش‌فرض‌های جدید اعمال می‌شود.

## نقشه راه اکسل — وضعیت
| مرحله | وضعیت |
|---|---|
| ۱- معماری نمایشگر ۱۲۸×۳۲/۶۴ | ✅ runtime |
| ۲- هماهنگی ارتفاع نمایشگر با WebApp و NVS | ✅ اسلات OLED |
| ۳- GPIO و LED وضعیت روی GPIO15 | ✅ (در فورک: `CONFIG_BLUERETRO_HW_IBLUECONTROL` → LED_P1_PIN=15) |
| ۴- توسعه اسکرین‌سیورها با انتخاب از WebApp | ✅ ۱۲ اسکرین‌سیور |
| ۵- ملودی‌های MethyleneX در Audio Engine | ✅ ۲۷ ملودی |
| ۶- مدیر میانبرهای DS4/DS5 | ✅ shortcut.c |
| ۷- پالت رنگ مستقل هر دسته + HID | ✅ manual/auto + چشمک اتصال |
| ۸- یکپارچه‌سازی | ✅ sync زنده MX↔UI |

## ساخت
دقیقاً مانند خود فورک (ESP-IDF **v6.1**). نسخه‌ی فریمویر از `PROJECT_VER` در CMakeLists می‌آید (الان: `mx-v4`) و WebApp همان را در صفحه Home نشان می‌دهد — فایل `version.txt` دیگر لازم نیست.

**PSX/PS2 (پیش‌فرض MethyleneX روی برد hw2):**
```bash
idf.py fullclean
rm -f sdkconfig sdkconfig.old
idf.py -D IDF_TARGET=esp32 -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/hw2/playstation" reconfigure build
idf.py -p /dev/ttyUSB0 flash monitor
```

**SNES (کانفیگ iBlueControl):**
```bash
idf.py fullclean
rm -f sdkconfig sdkconfig.old
idf.py -D IDF_TARGET=esp32 -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/hw2/ibluecontrol_snes" reconfigure build
```

⚠️ دو نکته‌ی مهم:
1. متغیر محیطی `BR_SYS` فقط **اسم پروژه/باینری** را عوض می‌کند؛ انتخاب واقعی سیستم فقط از `SDKCONFIG_DEFAULTS` انجام می‌شود. اگر `sdkconfig` قبلی حذف نشود، کانفیگ جدید **نادیده گرفته می‌شود** (همان باگ «فریمویر کش بود»).
2. متغیر `CONFIG_BLUERETRO_HW_IBLUECONTROL` فقط با `SYSTEM_SNES` مجاز است (پین‌اوت SNES داخلی: LED‌ها {15,4,15,4}، OE روی IO2/IO27، دکمه روی GPIO16). در بیلد PSX پین‌اوت استاندارد hw2 فعال است: **LED پورت۱=IO2، پورت۲=IO4**، دکمه BOOT=GPIO0، OLED روی IO17(SCL)/IO18(SDA)، بازر IO23.

هیچ سورس جدیدی به کانفیگ‌های دیگر تزریق نشده؛ همه تغییرات UI زیر `CONFIG_BLUERETRO_SYSTEM_PSX_PS2` گارد شده‌اند (و استاب‌های non-PSX هم‌امضا با ui.h هستند). فایل جدید `adapter/shortcut.c` به `main/CMakeLists.txt` اضافه شد.

## پروتکل BLE — چک‌لیست برای WebApp
- سرویس: `56830f56-5180-fab0-314b-2fa176799a00`
- کاراکتریستیک‌ها (بایت آخر UUID): a01=GlobalCfg(4B)، a02/a03=OutCfg، a04/a05=InCfg، a06=AbiVer(=2)، **a07=CfgCmd**، a08=OTA، a09=FwVer، a0a/a0b=MemoryCard، a0c=BDAddr، **a0d=MxCfgCtrl**، **a0e=MxCfgData**
- فرمان‌های CfgCmd (a07): `0x01` ABI، `0x02` FW ver، `0x03` BDAddr، `0x04` GameID، `0x05` CfgSrc، `0x06` File، `0x07` FwName، `0x10/0x11` default/gameid cfg، `0x12/0x13/0x14` dir/del، **`0x15` PreviewMelody(+melody id)**، **`0x16` PreviewStop**، **`0x17` AudioSettings(10B: enabled,vol,sound[8])**، `0x37` DeepSleep، `0x38` Reset، `0x39` Factory
- اسلات‌های MX: 0=Audio(enabled,vol,5 events) 1=OLED(enabled,rotation,panel_h,notifications,touchpad_nav,page_cnt,pages[]) 2=LED(auto_player,brightness,ports[8]RGB) 3=Idle(mode,timeout16) 4=Time(year16,month,day,hour,minute) 5=Features(bits) — نوشتن Pages مجاز نیست (read-only)
- Idle modes: 0=OFF 1=CUBE 2=STARS 3=TETRIS 4=PS_SYMBOLS 5=BALLS 6=PONG 7=CLOCK_ANALOG 8=CLOCK_FLIP 9=CLOCK_RECT 10=LOGO_PS 11=LOGO_PLAYSTATION
- شاخص ملودی‌ها: 0=DEFAULT … 26=ALERT (به ترتیب شیت اکسل)

## فایل‌های تغییر یافته
```
main/CMakeLists.txt            (+ shortcut.c)
main/main.c                    (ترتیب init + ui_mx_apply)
main/adapter/adapter.c         (هوک shortcut_hdl)
main/adapter/shortcut.c/.h     (جدید — میانبرهای Home)
main/adapter/config.c          (مدیر رنگ: flash + MX LED)
main/bluetooth/att_cfg.c       (پیش‌نمایش صدا + sync اسلات‌ها)
main/bluetooth/att_hid.c       (ذخیره باتری BAS)
main/bluetooth/hidp/ps.c       (باتری DS4 + چشمک اتصال lightbar)
main/system/manager.c          (صدای خاموش/ریست)
main/system/mx_config.h/.c     (لوگوها، اعتبارسنجی ۲۷ ملودی، پیش‌فرض‌ها)
main/system/ui.h/.c            (۲۷ ملودی، صفحات، باتری، سوایپ، flash، mx sync)
main/system/ui_gfx.h/.c        (ارتفاع پنل runtime)
main/system/ui_saver.h/.c      (۱۲ اسکرین‌سیور)
main/system/ui_logos.h         (جدید — بیت‌مپ‌های لوگو از اکسل)
```

## نکات شناخته‌شده
- باتری فقط یک‌بار هنگام init خوانده می‌شود (اشتراک BAS فعلاً subscribe نمی‌شود؛ DS4 از گزارش وضعیت هر بار به‌روز می‌شود).
- چشمک قرمز/نارنجی فقط روی دسته‌های PS4/PS5 (lightbar) اعمال می‌شود.
- `mx_config` روی NVS namespace `mx_cfg` ذخیره می‌شود و مستقل از فایل کانفیگ gameid است.


## افزونه‌های WebApp / Firmware — پایش دسته و MAC Spoof

این دو قابلیت در نسخه هماهنگ‌شده‌ی BlueRetro PS2 Bridge اضافه شده‌اند و از قرارداد BLE مشترک در `shared/protocol.yaml` پیروی می‌کنند:

- **Controller Test:** فرمان جدید `a07 / 0x18` با payload دو‌بایتی `[command, output_port]`. پاسخ ۱۷ بایت است: ماسک دکمه‌ها `u32 little-endian`، شش مقدار `i16 little-endian` برای LX/LY/RX/RY/L2/R2 و یک بایت اعتبار نمونه. Firmware snapshot را پس از تبدیل موفق گزارش PAD به generic ثبت می‌کند؛ داده‌ی قدیمی‌تر از ۷۵۰ میلی‌ثانیه نامعتبر اعلام می‌شود. این فرمان فقط خواندنی است و ورودی دسته یا mapping را تغییر نمی‌دهد.
- **MAC Address Spoof:** اسلات جدید MX شماره ۸ با ساختار `{magic=0x4D, enabled, mac[6]}` و طول ۸ بایت. آدرس در ترتیب نمایش (MSB-first) ذخیره می‌شود. Firmware هنگام بوت و پیش از راه‌اندازی Bluetooth، Base MAC را طوری تنظیم می‌کند که آدرس BR/EDR موردنظر از مشتق‌سازی ESP32 به دست آید. پس از ذخیره باید حداقل ۲ ثانیه برای ثبت NVS صبر کرد و سپس آداپتور را خاموش/روشن کرد. آدرس‌های صفر، multicast و آدرس‌هایی که به Base MAC معتبر تبدیل نمی‌شوند رد می‌شوند.
- عملیات read/write روی اسلات‌های MX همچنان زیر قفل مشترک WebApp انجام می‌شود. فرمان‌های a07 نیز قفل مستقل دارند تا زوج write/read بین صفحه‌ها و OTA با هم تداخل نکند.
- نسخه‌های قدیمی Firmware که اسلات ۸ یا فرمان `0x18` را نمی‌شناسند، در WebApp به‌عنوان قابلیت پشتیبانی‌نشده نمایش داده می‌شوند؛ هیچ‌کدام از شناسه‌های فرمان قدیمی بازاستفاده نشده‌اند و `GlobalCfg` چهار‌بایتی تغییر نکرده است.

این پیاده‌سازی در این مرحله از نظر کد و قرارداد پروتکل یکپارچه شده است؛ تأیید نهایی رفتار واقعی آدرس MAC و نمایش گزارش زنده دسته به ساخت Firmware، فلش روی برد و آزمایش سخت‌افزاری نیاز دارد.
