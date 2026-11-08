#ifndef __MX_CONFIG_H__
#define __MX_CONFIG_H__

#include <stdint.h>
#include <stddef.h>

#ifndef __packed
#define __packed __attribute__((__packed__))
#endif

enum mx_cfg_slot {
    MX_SLOT_AUDIO = 0,
    MX_SLOT_OLED,
    MX_SLOT_LED,
    MX_SLOT_IDLE,
    MX_SLOT_TIME,
    MX_SLOT_PAGES,
    MX_SLOT_FEATURES,
    MX_SLOT_KEYS,
    MX_SLOT_MAC,
    MX_SLOT_LAST,
};

struct mx_audio_cfg {
    uint8_t enabled;
    uint8_t volume;
    uint8_t ev_power_on;
    uint8_t ev_power_off;
    uint8_t ev_reset;
    uint8_t ev_bt_connect;
    uint8_t ev_bt_disconnect;
    uint8_t rsvd;
} __packed;

#define MX_OLED_PAGES_MAX 8
#define MX_OLED_PAGE_EMPTY 0xFF

struct mx_oled_cfg {
    uint8_t enabled;
    uint8_t rotation;
    uint8_t panel_h;
    uint8_t notifications;
    uint8_t touchpad_nav;
    uint8_t page_cnt;
    uint8_t pages[MX_OLED_PAGES_MAX];
} __packed;

#define MX_LED_PORTS 8

struct mx_led_cfg {
    uint8_t auto_player;
    uint8_t brightness;
    struct {
        uint8_t r, g, b;
    } ports[MX_LED_PORTS];
} __packed;

enum mx_idle_mode {
    MX_IDLE_OFF = 0,
    MX_IDLE_CUBE,
    MX_IDLE_STARS,
    MX_IDLE_TETRIS,
    MX_IDLE_PS_SYMBOLS,
    MX_IDLE_BALLS,
    MX_IDLE_PONG,
    MX_IDLE_CLOCK_ANALOG,
    MX_IDLE_CLOCK_FLIP,
    MX_IDLE_CLOCK_RECT,
    MX_IDLE_LOGO_PS,
    MX_IDLE_LOGO_PLAYSTATION,
    MX_IDLE_AUTO,
};

/* Number of built-in melodies shared with the UI/audio engine (ui.h).
   Kept here so MX_SLOT_AUDIO writes can be validated against it. */
#define MX_MELODY_COUNT 27

struct mx_idle_cfg {
    uint8_t mode;
    uint16_t idle_timeout;
} __packed;

struct mx_time_cfg {
    uint16_t year;
    uint8_t month;
    uint8_t day;
    uint8_t hour;
    uint8_t minute;
} __packed;

struct mx_features_cfg {
    uint8_t bits;
} __packed;

/* Configurable pad shortcut combos (WebApp Shortcuts page).
   Values are combo ids, see MX_KEYS_COMBO_* below. */
struct mx_keys_cfg {
    uint8_t saver_combo;    /* Combo that puts the OLED in screensaver mode */
    uint8_t menu_combo;     /* Combo that returns to the main menu pages */
} __packed;

/* Bluetooth BR/EDR address override. mac[] is in display/MSB-first order.
   The ESP32 BT controller derives its address from the base MAC + 2. */
struct mx_mac_cfg {
    uint8_t magic;          /* 0x4D — distinguishes this slot from legacy slots */
    uint8_t enabled;
    uint8_t mac[6];
} __packed;

#define MX_KEYS_COMBO_COUNT 8

/* Combo ids shared with the WebApp (Shortcuts page comboboxes).
   Generic btns: PAD_MM = Home/Options, PAD_MS = Share, PAD_LS/RS = L1/R1,
   PAD_LT/RT = L2/R2 (analog pads), PAD_LJ/RJ = L3/R3. */
#define MX_KEYS_COMBO_HOME_UP       0   /* Home + D-Pad up */
#define MX_KEYS_COMBO_HOME_DOWN     1   /* Home + D-Pad down */
#define MX_KEYS_COMBO_HOME_LEFT     2   /* Home + D-Pad left */
#define MX_KEYS_COMBO_HOME_RIGHT    3   /* Home + D-Pad right */
#define MX_KEYS_COMBO_SHARE_CROSS   4   /* Share + Cross */
#define MX_KEYS_COMBO_L1_R1         5   /* L1 + R1 */
#define MX_KEYS_COMBO_L2_R2         6   /* L2 + R2 */
#define MX_KEYS_COMBO_L3_R3         7   /* L3 + R3 */

void mx_config_init(void);
void mx_config_select_slot(uint8_t slot);
uint32_t mx_config_read_blob(uint8_t *dst, uint32_t max);
int32_t mx_config_write_blob(const uint8_t *src, uint32_t len);

const struct mx_audio_cfg *mx_cfg_audio(void);
const struct mx_oled_cfg *mx_cfg_oled(void);
const struct mx_led_cfg *mx_cfg_led(void);
const struct mx_idle_cfg *mx_cfg_idle(void);
const struct mx_time_cfg *mx_cfg_time(void);
const struct mx_features_cfg *mx_cfg_features(void);
const struct mx_keys_cfg *mx_cfg_keys(void);
const struct mx_mac_cfg *mx_cfg_mac(void);
void mx_cfg_set_time(const struct mx_time_cfg *t);
/* Thread-safe copies for tasks other than the one that owns the data */
void mx_cfg_time_get(struct mx_time_cfg *out);
void mx_cfg_ui_snapshot(struct mx_audio_cfg *a, struct mx_oled_cfg *o, struct mx_idle_cfg *i);

/* Monotonic counter bumped every time the LED slot changes (web write or
   touch swipe). Lets the manager re-send lightbar colors on any change. */
uint32_t mx_led_generation_get(void);

/* Per-port lightbar color from the touchpad swipe (ui.c): switches the LED
   slot to manual mode for that port only and marks it dirty. */
void mx_led_set_port_color(uint8_t port, const uint8_t rgb[3]);

/* Commit dirty MX slots to NVS. Call periodically from a non-BT task:
   NVS flash I/O inside the Bluetooth task causes timing violations and
   random controller disconnects on this unicore build. */
void mx_config_flush(void);

#endif
