/*
 * OLED (SSD1306, I2C) + passive buzzer feedback for BlueRetro.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _UI_H_
#define _UI_H_

#include <stdint.h>
#include <stdbool.h>

typedef enum {
    UI_EVT_BOOT = 0,        /* Firmware started */
    UI_EVT_PAIRING_START,   /* Bluetooth inquiry (pairing) mode on */
    UI_EVT_PAIRING_STOP,    /* Bluetooth inquiry (pairing) mode off */
    UI_EVT_ERROR,           /* Unrecoverable error (stays until power cycle) */
    UI_EVT_PADS,            /* Number of connected controllers, see ui_set_pads() */
    UI_EVT_ACTIVITY,        /* Wake the display (controller input, button...) */
    UI_EVT_SAVER_NEXT,      /* Next screensaver (only acts while a screensaver runs) */
    UI_EVT_SAVER_PREV,      /* Previous screensaver */
    UI_EVT_SETTINGS,        /* Settings changed, see ui_settings_set() */
    UI_EVT_SOUND_TEST,      /* Play one melody now, see ui_play_sound() */
    UI_EVT_COLOR_NEXT,      /* Next controller lightbar color (touchpad swipe up) */
    UI_EVT_COLOR_PREV,      /* Previous lightbar color (touchpad swipe down) */
    UI_EVT_PAGE_NEXT,       /* Next info page (Home + D-Pad left/right) */
    UI_EVT_PAGE_PREV,       /* Previous info page */
    UI_EVT_TOUCH_SWIPE,     /* Completed touchpad swipe, val = ui_swipe_dir_t.
                               The OLED stage decides what it means (saver vs battery). */
    UI_EVT_SAVER_ENTER,     /* Shortcut combo: put the OLED in screensaver mode now */
    UI_EVT_MENU_ENTER,      /* Shortcut combo: back to the main menu pages */
} ui_evt_t;

/* Touchpad swipe directions for UI_EVT_TOUCH_SWIPE */
typedef enum {
    UI_SWIPE_RIGHT = 0,     /* Finger moved left -> right */
    UI_SWIPE_LEFT,          /* Finger moved right -> left */
    UI_SWIPE_UP,
    UI_SWIPE_DOWN,
} ui_swipe_dir_t;

/* Events that can have their own melody (index into ui_settings_t.sound[]) */
typedef enum {
    UI_SND_BOOT = 0,
    UI_SND_PAIR_START,
    UI_SND_PAIR_STOP,
    UI_SND_ERROR,
    UI_SND_CONNECT,         /* A controller connected */
    UI_SND_DISCONNECT,      /* A controller disconnected */
    UI_SND_POWER_OFF,       /* Played right before the console power is cut */
    UI_SND_RESET,           /* Played right before the console reset pulse */
    UI_SND_COUNT,
} ui_snd_evt_t;

/* Built-in melodies: the 27 BlueRetro PS2 Bridge melodies (see the spec workbook). */
#define UI_MELODY_COUNT 27

#define UI_SAVER_AUTO 0xFF  /* saver_mode value: cycle through all screensavers */

typedef struct {
    uint16_t dim_after_s;       /* Idle seconds before dimming the display, 0 = never */
    uint16_t saver_after_s;     /* Idle seconds before the screensaver starts, 0 = never */
    uint16_t off_after_s;       /* Idle seconds before the display is switched off, 0 = never */
    uint8_t  contrast;          /* Normal brightness 0..255 */
    uint8_t  contrast_dim;      /* Brightness when dimmed / during the screensaver */
    uint8_t  saver_mode;        /* 0..(SAVER_COUNT-1) = fixed screensaver (same order as
                                   the MX idle modes minus OFF), UI_SAVER_AUTO = cycle */
    uint16_t saver_cycle_s;     /* Seconds per screensaver in UI_SAVER_AUTO mode */
    uint8_t  pixel_shift;       /* 1 = move the static screen by 1 px now and then (burn-in) */
    uint8_t  volume;            /* Buzzer volume 0..100, 0 = muted */
    uint8_t  sound[UI_SND_COUNT];   /* Melody used for each event (0 = no sound) */
    uint8_t  pad_color_mode;    /* 0 = BlueRetro's own player colors, 1 = pad_rgb for every controller */
    uint8_t  pad_rgb[3];        /* Lightbar color: red, green, blue */
} ui_settings_t;

typedef struct {
    uint8_t enabled;
    uint8_t volume;
    uint8_t sound[UI_SND_COUNT];
} ui_audio_settings_t;


/* Call once, after err_led_init(). Never blocks: the work is done in its own task. */
void ui_init(void);

/* Safe to call from any FreeRTOS task. Never blocks, drops the event if queue is full. */
void ui_event(ui_evt_t evt);

/* Update the connected controller count (beeps up/down when it changes). */
void ui_set_pads(uint8_t count);

/* Play a melody right away (for a "test" button). Ignores which event it belongs to. */
void ui_play_sound(uint8_t melody);
const char *ui_melody_name(uint8_t melody);

/* Controller lightbar color. Returns true when a custom color is selected; *rgb is then
   R | G << 8 | B << 16, the format BlueRetro keeps in hw_config.ps_ctrl_colors[]. */
bool ui_pad_color_get(uint32_t *rgb);
uint32_t ui_pad_color_generation(void);     /* Changes every time the color setting changes */

/* DualShock 4 touchpad, called for every input report.
   valid: this report carries a touch packet; down/x/y: finger state (x 0..1919, y 0..941);
   click: the touchpad is pressed. Swipes left/right change the screensaver, up/down the color. */
void ui_touch_feed(uint8_t valid, uint8_t down, uint16_t x, uint16_t y, uint8_t click, uint8_t src_port);
void ui_touch_reset(uint8_t src_port);

void ui_settings_get(ui_settings_t *out);
void ui_settings_set(const ui_settings_t *in);
bool ui_audio_settings_get(ui_audio_settings_t *out);
bool ui_audio_settings_set(const ui_audio_settings_t *in);

/* Push the current MX config slots (audio, oled, idle) into the UI settings.
   Called after boot and after every MX config write from BLE. */
void ui_mx_apply(void);

/* Play one of the ui_snd_evt_t event melodies right away (power off / reset). */
void ui_play_event(uint8_t evt);

/* Connect lightbar flash: red -> orange -> configured color, about 1 s.
   Pass the out_idx (wired port) of the pad that just connected. */
void ui_color_flash_start(uint8_t out_idx);
void ui_color_flash_stop(uint8_t out_idx);

/* Current temporary lightbar override for out_idx, or false when no flash runs. */
bool ui_color_flash_get(uint8_t out_idx, uint32_t *rgb);

/* Battery data is indexed by the controller's wired output port. */
#define UI_BATTERY_UNKNOWN      0
#define UI_BATTERY_DISCHARGING  1
#define UI_BATTERY_CHARGING     2
#define UI_BATTERY_FULL         3
#define UI_BATTERY_PERCENT_NA   0xFF

void ui_battery_set(uint8_t out_idx, uint8_t percent, uint8_t status);
uint8_t ui_battery_get(uint8_t out_idx);
uint8_t ui_battery_status_get(uint8_t out_idx);

bool ui_audio_preview(uint8_t melody);
bool ui_audio_preview_stop(void);
void ui_audio_preview_disconnect(void);


#endif /* _UI_H_ */
