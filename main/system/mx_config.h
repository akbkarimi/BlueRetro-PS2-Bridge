#ifndef __MX_CONFIG_H__
#define __MX_CONFIG_H__

#include <stdint.h>
#include <stdbool.h>
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
    uint8_t second;
} __packed;

struct mx_features_cfg {
    uint8_t bits;
} __packed;

/* Versioned Shortcut Manager configuration. All user-defined button shortcuts
 * require Home + at least one additional button; system-reserved Home+Start
 * and Home+Share remain owned by the fixed system shortcuts. */
#define MX_KEYS_VERSION 2
#define MX_KEYS_ACTION_MAX 8

enum mx_shortcut_action {
    MX_SC_NONE = 0,
    MX_SC_SAVER_ENTER = 1,
    MX_SC_MENU_ENTER = 2,
    MX_SC_PAGE_NEXT = 3,
    MX_SC_PAGE_PREV = 4,
    MX_SC_SAVER_NEXT = 5,
    MX_SC_SAVER_PREV = 6,
    MX_SC_DISCONNECT_PAD = 7,
    MX_SC_DISCONNECT_ALL = 8,
};

enum mx_shortcut_trigger {
    MX_SC_TRIGGER_PRESS = 0,
    MX_SC_TRIGGER_HOLD = 1,
    MX_SC_TRIGGER_DOUBLE = 2,
    MX_SC_TRIGGER_RELEASE = 3,
};

struct mx_shortcut_entry {
    uint8_t action;
    uint8_t trigger;
    uint8_t enabled;
    uint8_t reserved;
    uint32_t buttons;
    uint16_t hold_ms;
} __packed;

struct mx_keys_cfg {
    uint8_t version;
    uint8_t count;
    struct mx_shortcut_entry entries[MX_KEYS_ACTION_MAX];
} __packed;

/* Bluetooth BR/EDR address override. mac[] is in display/MSB-first order.
   The ESP32 BT controller derives its address from the base MAC + 2. */
struct mx_mac_cfg {
    uint8_t magic;          /* 0x4D — distinguishes this slot from legacy slots */
    uint8_t enabled;
    uint8_t mac[6];
} __packed;


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
bool mx_cfg_time_tick(void);

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
