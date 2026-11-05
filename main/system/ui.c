/*
 * OLED (SSD1306, I2C) + passive buzzer feedback for BlueRetro.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 *
 * - I2C is bit-banged on plain GPIO (open drain) so it never touches the
 *   hardware I2C registers that wii_i2c.c uses, and does not depend on the
 *   ESP-IDF I2C driver API.
 * - The buzzer uses LEDC high speed timer 1 / channel 1. led.c uses HS timer 0 /
 *   channel 0 and manager.c uses LOW speed timer 1, so nothing collides.
 * - Everything runs in one low priority task on core 0.
 * - Display power policy: active -> dim -> screensaver -> off, driven by the
 *   idle time since the last activity event (see ui_settings_t).
 */

#include <stdio.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include "system/gpio.h"
#include "driver/ledc.h"
#include "esp_rom_sys.h"
#include "esp_random.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "ui.h"
#include "ui_config.h"
#include "ui_gfx.h"
#include "ui_saver.h"
#include "mx_config.h"
#include "manager.h"

#ifdef CONFIG_BLUERETRO_SYSTEM_PSX_PS2

#define SAVER_FRAME_MS      100
#define PIXEL_SHIFT_PERIOD_S 60

typedef struct {
    uint8_t evt;
    uint8_t val;
    uint8_t val2;
} ui_msg_t;

typedef enum {
    ST_READY = 0,
    ST_PAIRING,
    ST_ERROR,
} ui_state_t;

typedef enum {
    STG_ACTIVE = 0,
    STG_DIM,
    STG_SAVER,
    STG_OFF,
} stage_t;

static ui_settings_t cfg = {
    .dim_after_s = 30,
    .saver_after_s = 60,
    .off_after_s = 300,
    .contrast = 0xCF,
    .contrast_dim = 0x10,
    .saver_mode = UI_SAVER_AUTO,
    .saver_cycle_s = 30,
    .pixel_shift = 1,
    .volume = 60,
    /* boot, pair start, pair stop, error, connect, disconnect, power off, reset
       = PS2 BOOT, MARIO UP, GAME OVER, ALERT, SUCCESS, BEEP3, GAME OVER, ALERT */
    .sound = { 14, 3, 8, 26, 25, 20, 8, 26 },
    .pad_color_mode = 0,
    .pad_rgb = { 0, 0, 255 },
};

static QueueHandle_t ui_q = NULL;
static QueueHandle_t audio_q = NULL;
static QueueHandle_t audio_preview_q = NULL;
static TaskHandle_t audio_task_handle = NULL;
static bool oled_ok = false;
static uint8_t oled_rotation = 0;       /* 0 = normal, 1 = 180 degrees */

/* ---------------- Info pages ---------------- */

/* The pages listed in the MX OLED slot, filtered to what this firmware renders */
typedef enum {
    PAGE_STATUS = 0,    /* Firmware name, BT status, pad count */
    PAGE_PADS,          /* Connected controller count + types */
    PAGE_BATTERY,       /* Battery level of pad 1 and pad 2 */
    PAGE_COLOR,         /* Active lightbar color */
    PAGE_TIME,          /* Clock page (MX time slot) */
    PAGE_MAX,
} page_id_t;

static uint8_t pages_enabled[MX_OLED_PAGES_MAX];
static uint8_t pages_cnt = 0;
static uint8_t page_cur = 0;            /* Index into pages_enabled[] */
static volatile uint8_t mx_geom_pending = 0;   /* Apply MX panel geometry in the UI task */

/* ---------------- Battery cache (per wired port) ---------------- */

#define UI_BATT_PORTS 8
static uint8_t battery_pct[UI_BATT_PORTS];  /* 0xFF = unknown */

/* ---------------- Lightbar connect flash (red -> orange -> color) ---------------- */

#define FLASH_STEP_MS 300
static struct {
    uint8_t out_idx;
    uint8_t active;
    uint32_t t0_ms;
} color_flash;

static void color_flash_reset(void) {
    color_flash.active = 0;
}

/* 0 = red, 1 = orange phase, else finished */
static int color_flash_phase(uint32_t now) {
    uint32_t dt = now - color_flash.t0_ms;

    if (dt < FLASH_STEP_MS) {
        return 0;
    }
    if (dt < 2 * FLASH_STEP_MS) {
        return 1;
    }
    return 2;
}

static ui_audio_settings_t audio_cfg = {
    .enabled = 1,
    .volume = 60,
    .sound = { 14, 3, 8, 26, 25, 20, 8, 26 },
};
static portMUX_TYPE audio_cfg_mux = portMUX_INITIALIZER_UNLOCKED;
static bool audio_cfg_overridden = false;
static bool audio_settings_loaded = false;

static ui_audio_settings_t audio_settings_snapshot(void) {
    ui_audio_settings_t snapshot;
    portENTER_CRITICAL(&audio_cfg_mux);
    snapshot = audio_cfg;
    portEXIT_CRITICAL(&audio_cfg_mux);
    return snapshot;
}

static void audio_settings_sync_legacy(void) {
    ui_audio_settings_t legacy = {
        .enabled = 1,
        .volume = cfg.volume,
    };
    memcpy(legacy.sound, cfg.sound, sizeof(legacy.sound));

    portENTER_CRITICAL(&audio_cfg_mux);
    if (!audio_cfg_overridden && !audio_settings_loaded) {
        audio_cfg = legacy;
    }
    portEXIT_CRITICAL(&audio_cfg_mux);
}

static ui_state_t st = ST_READY;
static uint8_t pads = 0;
static stage_t stage = STG_ACTIVE;
static bool redraw = true;
static uint32_t last_act_ms = 0;
static uint32_t saver_t0_ms = 0;
static uint32_t shift_t0_ms = 0;
static uint8_t shift_idx = 0;
static uint8_t auto_idx = 0;
static saver_id_t saver_cur = SAVER_SYMBOLS;
static bool forced_saver = false;       /* Screensaver picked with a swipe: stays until the next activity */
static uint32_t pad_gen = 1;            /* Bumped whenever the lightbar color setting changes */
static uint8_t pad_applied[4];          /* mode, r, g, b as of the last bump */
static uint8_t preset_idx = 0xFF;       /* Current lightbar preset, 0xFF = none */
static char toast_buf[24];
static uint32_t toast_until_ms = 0;

/* Retired legacy IDs remain reserved so MX idle-mode numbers stay ABI-stable. */
static bool saver_id_enabled(uint8_t id) {
    return id < SAVER_COUNT && id != SAVER_CLOCK_ANALOG &&
           id != SAVER_CLOCK_FLIP;
}

static uint8_t saver_next_enabled(uint8_t id, int dir) {
    for (int i = 0; i < SAVER_COUNT; i++) {
        id = (uint8_t)((id + SAVER_COUNT + dir) % SAVER_COUNT);
        if (saver_id_enabled(id)) return id;
    }
    return SAVER_CUBE;
}

#define TOAST_MS 2000

/* Lightbar colors the touchpad cycles through */
static const struct {
    const char *name;
    uint8_t rgb[3];
} pad_presets[] = {
    { "RED",    { 255,   0,   0 } },
    { "ORANGE", { 255,  96,   0 } },
    { "YELLOW", { 255, 200,   0 } },
    { "GREEN",  {   0, 255,   0 } },
    { "CYAN",   {   0, 255, 255 } },
    { "BLUE",   {   0,   0, 255 } },
    { "PURPLE", { 128,   0, 255 } },
    { "PINK",   { 255,   0, 128 } },
    { "WHITE",  { 255, 255, 255 } },
};
#define PAD_PRESET_COUNT ((int)(sizeof(pad_presets) / sizeof(pad_presets[0])))

/* ---------------- Bit-banged I2C (open drain) ---------------- */

static inline void i2c_delay(void) {
    esp_rom_delay_us(UI_I2C_DELAY_US);
}

static inline void sda_set(int level) { gpio_set_level(UI_SDA_PIN, level); }
static inline void scl_set(int level) { gpio_set_level(UI_SCL_PIN, level); }

static void i2c_pins_init(void) {
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_INPUT_OUTPUT_OD,
        .pin_bit_mask = (1ULL << UI_SDA_PIN) | (1ULL << UI_SCL_PIN),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io_conf);
    /* Make sure no peripheral (e.g. the old status LED PWM) owns these pins */
    esp_rom_gpio_connect_out_signal(UI_SDA_PIN, SIG_GPIO_OUT_IDX, false, false);
    esp_rom_gpio_connect_out_signal(UI_SCL_PIN, SIG_GPIO_OUT_IDX, false, false);
    sda_set(1);
    scl_set(1);
}

static void i2c_start(void) {
    sda_set(1); scl_set(1); i2c_delay();
    sda_set(0); i2c_delay();
    scl_set(0); i2c_delay();
}

static void i2c_stop(void) {
    sda_set(0); i2c_delay();
    scl_set(1); i2c_delay();
    sda_set(1); i2c_delay();
}

/* Returns true if the slave ACKed */
static bool i2c_write(uint8_t data) {
    for (int i = 7; i >= 0; i--) {
        sda_set((data >> i) & 1);
        i2c_delay();
        scl_set(1); i2c_delay();
        scl_set(0); i2c_delay();
    }
    sda_set(1);             /* release SDA for ACK */
    i2c_delay();
    scl_set(1); i2c_delay();
    bool ack = (gpio_get_level(UI_SDA_PIN) == 0);
    scl_set(0); i2c_delay();
    return ack;
}

/* ---------------- SSD1306 ---------------- */

static bool oled_write(uint8_t control, const uint8_t *buf, size_t len) {
    bool ok;

    i2c_start();
    ok = i2c_write(UI_OLED_ADDR << 1);
    if (ok) {
        ok = i2c_write(control);
    }
    for (size_t i = 0; ok && i < len; i++) {
        ok = i2c_write(buf[i]);
    }
    i2c_stop();
    return ok;
}

static bool oled_cmds(const uint8_t *cmds, size_t len) {
    return oled_write(0x00, cmds, len);
}

static bool oled_apply_geometry(void) {
    /* Re-apply multiplex / COM pins / scan direction for the current geometry.
       rotation 1 = 180 degrees (flip both segment remap and COM scan). */
    uint8_t flip = 0;
    const uint8_t seq[] = {
        0xAE,                           /* display off */
        0xA8, (uint8_t)(gfx_h() - 1),   /* multiplex ratio */
        0xD3, 0x00,                     /* display offset */
        0x40,                           /* start line 0 */
        (flip ^ oled_rotation) ? 0xA0 : 0xA1,   /* segment remap */
        (flip ^ oled_rotation) ? 0xC0 : 0xC8,   /* COM scan direction */
        0xDA, (gfx_h() == 64) ? 0x12 : 0x02,    /* COM pins */
        0xA8, (uint8_t)(gfx_h() - 1),   /* multiplex again after COM pins */
        0xAF,                           /* display on */
    };

    return oled_cmds(seq, sizeof(seq));
}

static bool oled_init(void) {
    const uint8_t init_seq[] = {
        0xAE,                           /* display off */
        0xD5, 0x80,                     /* clock divide */
        0xA8, UI_OLED_HEIGHT - 1,       /* multiplex ratio */
        0xD3, 0x00,                     /* display offset */
        0x40,                           /* start line 0 */
        0x8D, 0x14,                     /* charge pump on */
        0x20, 0x00,                     /* horizontal addressing mode */
        UI_OLED_FLIP ? 0xA0 : 0xA1,     /* segment remap */
        UI_OLED_FLIP ? 0xC0 : 0xC8,     /* COM scan direction */
        0xDA, (UI_OLED_HEIGHT == 64) ? 0x12 : 0x02, /* COM pins */
        0x81, 0xCF,                     /* contrast */
        0xD9, 0xF1,                     /* pre-charge */
        0xDB, 0x40,                     /* VCOMH */
        0xA4,                           /* resume from RAM */
        0xA6,                           /* normal (not inverted) */
        0xAF,                           /* display on */
    };

    return oled_cmds(init_seq, sizeof(init_seq));
}

static void oled_power(bool on) {
    const uint8_t cmd = on ? 0xAF : 0xAE;

    oled_cmds(&cmd, 1);
}

static void oled_contrast(uint8_t value) {
    const uint8_t cmds[] = { 0x81, value };

    oled_cmds(cmds, sizeof(cmds));
}

/* Send the whole framebuffer */
static void oled_flush(void) {
    const uint8_t pages = (uint8_t)(gfx_h() / 8);
    const uint8_t win[] = { 0x21, 0, GFX_W - 1, 0x22, 0, (uint8_t)(pages - 1) };

    if (!oled_cmds(win, sizeof(win))) {
        return;
    }
    oled_write(0x40, gfx_buffer(), (size_t)(GFX_W * pages));
}

/* ---------------- Buzzer (passive, LEDC HS timer 1 / channel 1) ---------------- */

static void buzzer_init(void) {
    ledc_timer_config_t timer = {
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = 2000,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_num = LEDC_TIMER_1,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ledc_channel_config_t chan = {
        .channel    = LEDC_CHANNEL_1,
        .duty       = 0,
        .gpio_num   = UI_BUZZER_PIN,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_TIMER_1,
    };

    ledc_timer_config(&timer);
    ledc_channel_config(&chan);
}

/* A melody is a list of notes ending with ms = 0. freq = 0 is a rest. */
typedef struct {
    uint16_t freq;
    uint16_t ms;
} note_t;

/* Note frequencies from the MethyleneX spec workbook */
#define NOTE_C4  262
#define NOTE_D4  294
#define NOTE_E4  330
#define NOTE_F4  349
#define NOTE_G4  392
#define NOTE_A4  440
#define NOTE_B4  494
#define NOTE_C5  523
#define NOTE_D5  587
#define NOTE_E5  659
#define NOTE_F5  698
#define NOTE_G5  784
#define NOTE_A5  880
#define NOTE_B5  988
#define NOTE_C6  1047
#define NOTE_D6  1175
#define NOTE_E6  1319
#define NOTE_G6  1568
#define NOTE_REST 0

/* The 27 MethyleneX melodies, note for note from the spec workbook */
static const note_t m_default[]      = { {NOTE_C5, 60}, {0, 0} };
static const note_t m_silent[]       = { {0, 0} };
static const note_t m_boot_chime[]   = { {NOTE_C5, 80}, {NOTE_E5, 80}, {NOTE_G5, 120}, {0, 0} };
static const note_t m_mario_up[]     = { {NOTE_E5, 90}, {NOTE_G5, 90}, {NOTE_E6, 90}, {NOTE_C6, 90}, {NOTE_D6, 90}, {NOTE_G6, 160}, {0, 0} };
static const note_t m_zelda[]        = { {NOTE_A4, 80}, {NOTE_B4, 80}, {NOTE_F5, 80}, {NOTE_A5, 200}, {0, 0} };
static const note_t m_sonic_ring[]   = { {NOTE_G5, 60}, {NOTE_C6, 120}, {0, 0} };
static const note_t m_coin[]         = { {NOTE_B5, 60}, {NOTE_E6, 180}, {0, 0} };
static const note_t m_one_up[]       = { {NOTE_E5, 70}, {NOTE_G5, 70}, {NOTE_E6, 70}, {NOTE_C6, 70}, {NOTE_D6, 70}, {NOTE_G6, 70}, {0, 0} };
static const note_t m_game_over[]    = { {NOTE_C5, 150}, {NOTE_G4, 150}, {NOTE_E4, 200}, {NOTE_A4, 120}, {NOTE_B4, 120}, {NOTE_A4, 120}, {NOTE_G4, 160}, {0, 0} };
static const note_t m_star_power[]   = { {NOTE_C5, 60}, {NOTE_E5, 60}, {NOTE_G5, 60}, {NOTE_C6, 60}, {NOTE_E6, 60}, {NOTE_G6, 100}, {0, 0} };
static const note_t m_megalovia[]    = { {NOTE_D4, 120}, {NOTE_D4, 120}, {NOTE_D5, 120}, {NOTE_A4, 120}, {NOTE_REST, 60}, {NOTE_G4, 120}, {0, 0} };
static const note_t m_mii[]          = { {NOTE_C5, 100}, {NOTE_E5, 100}, {NOTE_G5, 100}, {NOTE_E5, 100}, {NOTE_C5, 200}, {0, 0} };
static const note_t m_wii_shop[]     = { {NOTE_D5, 150}, {NOTE_G5, 150}, {NOTE_B5, 150}, {NOTE_A5, 150}, {NOTE_G5, 250}, {0, 0} };
static const note_t m_psp_boot[]     = { {NOTE_G4, 100}, {NOTE_C5, 100}, {NOTE_E5, 100}, {NOTE_G5, 250}, {0, 0} };
static const note_t m_ps2_boot[]     = { {NOTE_E4, 200}, {NOTE_B4, 200}, {NOTE_E5, 400}, {0, 0} };
static const note_t m_dreamcast[]    = { {NOTE_C5, 80}, {NOTE_F5, 80}, {NOTE_A5, 80}, {NOTE_F5, 80}, {NOTE_C5, 200}, {0, 0} };
static const note_t m_sega[]         = { {NOTE_G4, 90}, {NOTE_C5, 90}, {NOTE_E5, 90}, {NOTE_G5, 90}, {NOTE_C6, 300}, {0, 0} };
static const note_t m_chiptune_1[]   = { {NOTE_C5, 80}, {NOTE_D5, 80}, {NOTE_E5, 80}, {NOTE_F5, 80}, {NOTE_G5, 80}, {NOTE_A5, 80}, {NOTE_B5, 80}, {NOTE_C6, 160}, {0, 0} };
static const note_t m_chiptune_2[]   = { {NOTE_A4, 100}, {NOTE_C5, 100}, {NOTE_E5, 100}, {NOTE_A5, 100}, {NOTE_E5, 100}, {NOTE_C5, 200}, {0, 0} };
static const note_t m_chiptune_3[]   = { {NOTE_E5, 60}, {NOTE_D5, 60}, {NOTE_C5, 60}, {NOTE_D5, 60}, {NOTE_E5, 60}, {NOTE_G5, 120}, {0, 0} };
static const note_t m_beep3[]        = { {NOTE_C5, 90}, {NOTE_REST, 60}, {NOTE_C5, 90}, {NOTE_REST, 60}, {NOTE_C5, 90}, {0, 0} };
static const note_t m_siren[]        = { {NOTE_C5, 150}, {NOTE_G4, 150}, {NOTE_C5, 150}, {NOTE_G4, 150}, {0, 0} };
static const note_t m_r2d2[]         = { {NOTE_C6, 40}, {NOTE_E5, 30}, {NOTE_G5, 40}, {NOTE_C6, 30}, {NOTE_E6, 60}, {0, 0} };
static const note_t m_doorbell[]     = { {NOTE_E5, 200}, {NOTE_C5, 350}, {0, 0} };
static const note_t m_tada[]         = { {NOTE_C5, 80}, {NOTE_F5, 80}, {NOTE_G5, 80}, {NOTE_C6, 250}, {0, 0} };
static const note_t m_success[]      = { {NOTE_C5, 70}, {NOTE_E5, 70}, {NOTE_G5, 70}, {NOTE_C6, 70}, {0, 0} };
static const note_t m_alert[]        = { {NOTE_A5, 120}, {NOTE_REST, 40}, {NOTE_A5, 120}, {0, 0} };

static const struct {
    const char *name;
    const note_t *notes;
} melodies[UI_MELODY_COUNT] = {
    { "DEFAULT",    m_default },
    { "SILENT",     m_silent },
    { "BOOT CHIME", m_boot_chime },
    { "MARIO UP",   m_mario_up },
    { "ZELDA",      m_zelda },
    { "SONIC RING", m_sonic_ring },
    { "COIN",       m_coin },
    { "ONE UP",     m_one_up },
    { "GAME OVER",  m_game_over },
    { "STAR POWER", m_star_power },
    { "MEGALOVIA",  m_megalovia },
    { "MII",        m_mii },
    { "WII SHOP",   m_wii_shop },
    { "PSP BOOT",   m_psp_boot },
    { "PS2 BOOT",   m_ps2_boot },
    { "DREAMCAST",  m_dreamcast },
    { "SEGA",       m_sega },
    { "CHIPTUNE 1", m_chiptune_1 },
    { "CHIPTUNE 2", m_chiptune_2 },
    { "CHIPTUNE 3", m_chiptune_3 },
    { "BEEP3",      m_beep3 },
    { "SIREN",      m_siren },
    { "R2D2",       m_r2d2 },
    { "DOORBELL",   m_doorbell },
    { "TADA",       m_tada },
    { "SUCCESS",    m_success },
    { "ALERT",      m_alert },
};

#define AUDIO_NOTIFY_REQUEST       (1u << 0)
#define AUDIO_NOTIFY_STOP_PREVIEW  (1u << 1)
#define AUDIO_NOTIFY_STOP_ALL      (1u << 2)

typedef enum {
    AUDIO_REQ_INTERNAL = 0,
    AUDIO_REQ_PREVIEW,
} audio_req_type_t;

typedef struct {
    uint8_t melody;
    uint8_t volume;
    uint8_t type;
} audio_req_t;

static void audio_notify(uint32_t flags) {
    TaskHandle_t task = audio_task_handle;

    if (task) {
        xTaskNotify(task, flags, eSetBits);
    }
}

static bool audio_next_request(audio_req_t *req) {
    if (audio_preview_q &&
        xQueueReceive(audio_preview_q, req, 0) == pdTRUE) {
        return true;
    }

    return audio_q && xQueueReceive(audio_q, req, 0) == pdTRUE;
}

/* Internal sound requests replace only pending internal requests. */
static void audio_request(uint8_t melody, uint8_t volume) {
    audio_req_t req = {
        .melody = melody,
        .volume = volume,
        .type = AUDIO_REQ_INTERNAL,
    };

    if (audio_q && xQueueOverwrite(audio_q, &req) == pdPASS) {
        audio_notify(AUDIO_NOTIFY_REQUEST);
    }
}

/* Preview requests have a separate queue and always have priority. */
typedef enum {
    AUDIO_WAIT_TIMEOUT = 0,
    AUDIO_WAIT_REPLACED,
    AUDIO_WAIT_STOPPED,
} audio_wait_result_t;

/* Wait for a new request or a control command during a note/rest. */
static audio_wait_result_t audio_wait_request(audio_req_t *current,
                                               audio_req_t *next,
                                               uint32_t duration_ms) {
    TickType_t start = xTaskGetTickCount();
    TickType_t duration = pdMS_TO_TICKS(duration_ms);

    while (1) {
        TickType_t elapsed = xTaskGetTickCount() - start;
        if (elapsed >= duration) {
            return AUDIO_WAIT_TIMEOUT;
        }

        uint32_t flags = 0;
        TickType_t remaining = duration - elapsed;

        if (xTaskNotifyWait(0, UINT32_MAX, &flags, remaining) != pdTRUE) {
            return AUDIO_WAIT_TIMEOUT;
        }

        if (flags & AUDIO_NOTIFY_STOP_ALL) {
            ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);
            if (audio_q) xQueueReset(audio_q);
            if (audio_preview_q) xQueueReset(audio_preview_q);
            return AUDIO_WAIT_STOPPED;
        }

        if (flags & AUDIO_NOTIFY_STOP_PREVIEW) {
            if (audio_preview_q) xQueueReset(audio_preview_q);

            if (current->type == AUDIO_REQ_PREVIEW) {
                ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);
                if (audio_q) xQueueReset(audio_q);
                return AUDIO_WAIT_STOPPED;
            }
        }

        if (audio_next_request(next)) {
            if (current->type == AUDIO_REQ_PREVIEW &&
                next->type == AUDIO_REQ_INTERNAL) {
                /* Discard internal events while Preview is active. */
                continue;
            }

            ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);
            return AUDIO_WAIT_REPLACED;
        }
    }
}

/* A replacement request is returned through req; STOP never reads an unset value. */
static bool audio_play_melody(audio_req_t *req) {
    uint8_t id = req->melody;
    uint32_t duty = (512u * (req->volume > 100 ? 100 : req->volume)) / 100;

    ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);

    if (id >= UI_MELODY_COUNT || melodies[id].notes == NULL || duty == 0) {
        if (req->type == AUDIO_REQ_PREVIEW && audio_q) {
            xQueueReset(audio_q);
        }
        return false;
    }

    for (const note_t *n = melodies[id].notes; n->ms; n++) {
        if (n->freq) {
            ledc_set_freq(LEDC_HIGH_SPEED_MODE, LEDC_TIMER_1, n->freq);
            ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, duty, 0);
        }

        audio_req_t next;
        audio_wait_result_t result = audio_wait_request(req, &next, n->ms);

        if (result == AUDIO_WAIT_REPLACED) {
            *req = next;
            return true;
        }

        if (result == AUDIO_WAIT_STOPPED) {
            return false;
        }

        if (n->freq) {
            ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);
        }
    }

    /* Do not replay internal events that arrived during a completed Preview. */
    if (req->type == AUDIO_REQ_PREVIEW && audio_q) {
        xQueueReset(audio_q);
    }

    return false;
}

static void play_sound(ui_snd_evt_t evt) {
    if (evt < UI_SND_COUNT) {
        ui_audio_settings_t settings = audio_settings_snapshot();
        if (settings.enabled) {
            audio_request(settings.sound[evt], settings.volume);
        }
    }
}

static void audio_task(void *param) {
    audio_req_t req;
    uint32_t flags;

    (void)param;
    buzzer_init();

    while (1) {
        flags = 0;
        xTaskNotifyWait(0, UINT32_MAX, &flags, portMAX_DELAY);

        if (flags & AUDIO_NOTIFY_STOP_ALL) {
            ledc_set_duty_and_update(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_1, 0, 0);
            if (audio_q) xQueueReset(audio_q);
            if (audio_preview_q) xQueueReset(audio_preview_q);
            continue;
        }

        if (flags & AUDIO_NOTIFY_STOP_PREVIEW) {
            if (audio_preview_q) xQueueReset(audio_preview_q);
        }

        if (audio_next_request(&req)) {
            while (audio_play_melody(&req)) {
                /* req contains the replacement request when available. */
            }
        }
    }
}

/* ---------------- Screens ---------------- */

static uint32_t now_ms(void) {
    return (uint32_t)xTaskGetTickCount() * portTICK_PERIOD_MS;
}

static void render_status(void) {
    static const int8_t shift[4][2] = { {0, 0}, {1, 0}, {1, 1}, {0, 1} };
    const char *st_str = (st == ST_ERROR) ? "ERROR" : (st == ST_PAIRING) ? "PAIRING..." : "READY";
    char buf[24];

    gfx_clear();
    if (cfg.pixel_shift) {
        gfx_set_offset(shift[shift_idx][0], shift[shift_idx][1]);
    }
    else {
        gfx_set_offset(0, 0);
    }
    gfx_text(0, 1, UI_TITLE);
    snprintf(buf, sizeof(buf), "STATUS: %s", st_str);
    gfx_text(0, 12, buf);
    if (toast_until_ms && (int32_t)(toast_until_ms - now_ms()) > 0) {
        snprintf(buf, sizeof(buf), "%s", toast_buf);
    }
    else {
        snprintf(buf, sizeof(buf), "PADS: %u", (unsigned)pads);
    }
    gfx_text(0, 23, buf);
    gfx_set_offset(0, 0);
}

/* Info pages shown in the active stage (Home + D-Pad left/right cycles) */
static void render_page(uint8_t page) {
    static const int8_t shift[4][2] = { {0, 0}, {1, 0}, {1, 1}, {0, 1} };
    char buf[24];

    if (page >= PAGE_MAX) {
        render_status();
        return;
    }

    gfx_clear();
    if (cfg.pixel_shift) {
        gfx_set_offset(shift[shift_idx][0], shift[shift_idx][1]);
    }
    else {
        gfx_set_offset(0, 0);
    }

    switch (page) {
        case PAGE_PADS:
            gfx_text(0, 1, "CONTROLLERS");
            snprintf(buf, sizeof(buf), "CONNECTED: %u", (unsigned)pads);
            gfx_text(0, 12, buf);
            snprintf(buf, sizeof(buf), "PORTS P1-P4 ACTIVE");
            gfx_text(0, 23, buf);
            break;
        case PAGE_BATTERY: {
            uint8_t b1 = (UI_BATT_PORTS > 0) ? battery_pct[0] : 0xFF;
            uint8_t b2 = (UI_BATT_PORTS > 1) ? battery_pct[1] : 0xFF;

            gfx_text(0, 1, "BATTERY");
            if (b1 == 0xFF) {
                gfx_text(0, 12, "P1: N/A");
            }
            else {
                snprintf(buf, sizeof(buf), "P1: %u%%", (unsigned)b1);
                gfx_text(0, 12, buf);
            }
            if (b2 == 0xFF) {
                gfx_text(0, 23, "P2: N/A");
            }
            else {
                snprintf(buf, sizeof(buf), "P2: %u%%", (unsigned)b2);
                gfx_text(0, 23, buf);
            }
            break;
        }
        case PAGE_COLOR: {
            /* Show what the pads really get: the MX LED slot is the live source
               (web panel + touch swipes write it), not the legacy UI copy. */
            const struct mx_led_cfg *led = mx_cfg_led();

            gfx_text(0, 1, "LIGHTBAR");
            if (led == NULL || led->auto_player) {
                gfx_text(0, 12, "PLAYER COLORS");
            }
            else {
                snprintf(buf, sizeof(buf), "P1: %02X%02X%02X",
                    (unsigned)led->ports[0].r, (unsigned)led->ports[0].g, (unsigned)led->ports[0].b);
                gfx_text(0, 12, buf);
                snprintf(buf, sizeof(buf), "P2: %02X%02X%02X",
                    (unsigned)led->ports[1].r, (unsigned)led->ports[1].g, (unsigned)led->ports[1].b);
                gfx_text(0, 23, buf);
            }
            break;
        }
        case PAGE_TIME: {
            /* Big 7-segment clock filling the full panel width */
            const struct mx_time_cfg *t = mx_cfg_time();
            int h = gfx_h();
            int ck_h = (h >= 48) ? 40 : (h - 10);

            gfx_big_hhmm(0, 0, GFX_W, ck_h, t->hour, t->minute, 1);
            snprintf(buf, sizeof(buf), "%04u-%02u-%02u", t->year, t->month, t->day);
            gfx_text((GFX_W - 4 - (int)strlen(buf) * 6) / 2, h - 8, buf);
            break;
        }
        case PAGE_STATUS:
        default:
            render_status();
            return;
    }
    gfx_set_offset(0, 0);
}

/* ---------------- Settings persistence (NVS) ---------------- */

#define SETTINGS_NS         "ui_cfg"
#define SETTINGS_KEY        "cfg"
#define SETTINGS_MAGIC      0x5549
#define SETTINGS_VERSION    3
#define SETTINGS_LOAD_TRIES 30      /* NVS is initialised by main() after us: retry once a second */
#define SETTINGS_SAVE_DELAY_MS 2000 /* Wait a bit so a burst of changes is written once */

#define AUDIO_SETTINGS_KEY     "audio"
#define AUDIO_SETTINGS_MAGIC   0x5541
#define AUDIO_SETTINGS_VERSION 2

typedef struct {
    uint16_t magic;
    uint8_t version;
    uint8_t size;
    ui_settings_t cfg;
} settings_blob_t;

typedef struct {
    uint16_t magic;
    uint8_t version;
    uint8_t size;
    ui_audio_settings_t cfg;
} audio_settings_blob_t;

static bool settings_loaded = false;
static uint8_t load_tries = 0;
static bool save_pending = false;
static uint32_t save_req_ms = 0;

static bool audio_save_pending = false;
static bool audio_save_blocked = false;
static uint32_t audio_save_req_ms = 0;

/* Keep any value that came from outside (web panel, flash) inside what the code can handle */
static void settings_sanitize(void) {
    if (cfg.volume > 100) {
        cfg.volume = 100;
    }
    for (int i = 0; i < UI_SND_COUNT; i++) {
        if (cfg.sound[i] >= UI_MELODY_COUNT) {
            cfg.sound[i] = 0;
        }
    }
    if (cfg.saver_mode >= SAVER_COUNT) {
        cfg.saver_mode = UI_SAVER_AUTO;
    }
    if (cfg.pad_color_mode > 1) {
        cfg.pad_color_mode = 0;
    }
}

/* Tell the manager task (it polls ui_pad_color_generation()) that the lightbar color changed,
   and find which preset the current color is, if any */
static void pad_color_check(void) {
    uint8_t now[4] = { cfg.pad_color_mode, cfg.pad_rgb[0], cfg.pad_rgb[1], cfg.pad_rgb[2] };

    if (memcmp(now, pad_applied, sizeof(now)) != 0) {
        memcpy(pad_applied, now, sizeof(now));
        pad_gen++;
    }
    preset_idx = 0xFF;
    if (cfg.pad_color_mode) {
        for (int i = 0; i < PAD_PRESET_COUNT; i++) {
            if (memcmp(pad_presets[i].rgb, cfg.pad_rgb, 3) == 0) {
                preset_idx = (uint8_t)i;
                break;
            }
        }
    }
}

static void audio_settings_mark_save(void) {
    portENTER_CRITICAL(&audio_cfg_mux);
    audio_save_pending = true;
    audio_save_blocked = false;
    audio_save_req_ms = now_ms();
    portEXIT_CRITICAL(&audio_cfg_mux);
}

/* Returns false while NVS is not ready yet. A missing or incompatible blob keeps the defaults. */
static bool settings_load(void) {
    nvs_handle_t h;
    settings_blob_t blob;
    size_t len = sizeof(blob);

    if (nvs_open(SETTINGS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return false;
    }
    esp_err_t err = nvs_get_blob(h, SETTINGS_KEY, &blob, &len);

    nvs_close(h);
    if (err == ESP_OK && len == sizeof(blob) && blob.magic == SETTINGS_MAGIC &&
        blob.version == SETTINGS_VERSION && blob.size == sizeof(ui_settings_t)) {
        memcpy(&cfg, &blob.cfg, sizeof(cfg));
        settings_sanitize();
    }
    return true;
}

static void settings_save(void) {
    nvs_handle_t h;
    settings_blob_t blob = {
        .magic = SETTINGS_MAGIC,
        .version = SETTINGS_VERSION,
        .size = sizeof(ui_settings_t),
    };

    memcpy(&blob.cfg, &cfg, sizeof(cfg));
    if (nvs_open(SETTINGS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return;
    }
    if (nvs_set_blob(h, SETTINGS_KEY, &blob, sizeof(blob)) == ESP_OK) {
        nvs_commit(h);
    }
    nvs_close(h);
}


/* Load independent audio settings without overwriting an early API update. */
static bool audio_settings_load(void) {
    nvs_handle_t h;
    audio_settings_blob_t blob;
    size_t len = sizeof(blob);

    if (nvs_open(SETTINGS_NS, NVS_READONLY, &h) != ESP_OK) {
        return false;
    }

    esp_err_t err = nvs_get_blob(h, AUDIO_SETTINGS_KEY, &blob, &len);
    nvs_close(h);

    bool valid = err == ESP_OK &&
        len == sizeof(blob) &&
        blob.magic == AUDIO_SETTINGS_MAGIC &&
        blob.version == AUDIO_SETTINGS_VERSION &&
        blob.size == sizeof(ui_audio_settings_t) &&
        blob.cfg.enabled <= 1 &&
        blob.cfg.volume <= 100;

    if (valid) {
        for (int i = 0; i < UI_SND_COUNT; i++) {
            if (blob.cfg.sound[i] >= UI_MELODY_COUNT) {
                valid = false;
                break;
            }
        }
    }

    bool overridden;
    portENTER_CRITICAL(&audio_cfg_mux);
    overridden = audio_cfg_overridden;
    if (valid && !overridden) {
        audio_cfg = blob.cfg;
    }
    audio_settings_loaded = true;
    audio_save_blocked = !valid && err != ESP_ERR_NVS_NOT_FOUND && !overridden;
    portEXIT_CRITICAL(&audio_cfg_mux);

    if (err == ESP_ERR_NVS_NOT_FOUND || overridden) {
        audio_settings_mark_save();
    }

    return true;
}

static void audio_settings_save(void) {
    ui_audio_settings_t snapshot;
    bool blocked;

    portENTER_CRITICAL(&audio_cfg_mux);
    blocked = audio_save_blocked;
    if (!blocked) {
        snapshot = audio_cfg;
        audio_save_pending = false;
    }
    portEXIT_CRITICAL(&audio_cfg_mux);

    if (blocked) {
        return;
    }

    nvs_handle_t h;
    audio_settings_blob_t blob = {
        .magic = AUDIO_SETTINGS_MAGIC,
        .version = AUDIO_SETTINGS_VERSION,
        .size = sizeof(ui_audio_settings_t),
        .cfg = snapshot,
    };

    esp_err_t err = nvs_open(SETTINGS_NS, NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_blob(h, AUDIO_SETTINGS_KEY, &blob, sizeof(blob));
        if (err == ESP_OK) {
            err = nvs_commit(h);
        }
        nvs_close(h);
    }

    if (err != ESP_OK) {
        portENTER_CRITICAL(&audio_cfg_mux);
        audio_save_pending = true;
        audio_save_req_ms = now_ms();
        portEXIT_CRITICAL(&audio_cfg_mux);
    }
}

/* ---------------- Display power policy ---------------- */

static stage_t compute_stage(uint32_t idle_s) {
    stage_t s = STG_ACTIVE;

    if (cfg.dim_after_s && idle_s >= cfg.dim_after_s) {
        s = STG_DIM;
    }
    /* Never hide an error behind a screensaver or a black screen */
    if (st != ST_ERROR) {
        if (cfg.saver_after_s && idle_s >= cfg.saver_after_s) {
            s = STG_SAVER;
        }
        if (forced_saver) {
            s = STG_SAVER;
        }
        if (cfg.off_after_s && idle_s >= cfg.off_after_s) {
            s = STG_OFF;
        }
    }
    return s;
}

static void apply_contrast(void) {
    if (stage == STG_ACTIVE) {
        oled_contrast(cfg.contrast);
    }
    else if (stage != STG_OFF) {
        oled_contrast(cfg.contrast_dim);
    }
}

static void saver_pick_and_start(uint32_t t) {
    uint8_t requested = (cfg.saver_mode < SAVER_COUNT && !forced_saver) ? cfg.saver_mode : auto_idx;
    if (!saver_id_enabled(requested)) requested = SAVER_CLOCK_RECT;
    saver_cur = (saver_id_t)requested;
    saver_start(saver_cur);
    saver_t0_ms = t;
}

static void enter_stage(stage_t n, uint32_t t) {
    stage_t old = stage;

    if (n == old) {
        return;
    }
    stage = n;
    if (!oled_ok) {
        return;
    }
    if (old == STG_OFF && n != STG_OFF) {
        oled_power(true);
    }
    switch (n) {
        case STG_ACTIVE:
        case STG_DIM:
            apply_contrast();
            redraw = true;
            break;
        case STG_SAVER:
            apply_contrast();
            saver_pick_and_start(t);
            break;
        case STG_OFF:
            oled_power(false);
            break;
    }
}

static void update(void) {
    uint32_t t = now_ms();

    if (!settings_loaded && load_tries < SETTINGS_LOAD_TRIES) {
        load_tries++;
        if (settings_load()) {
            audio_settings_sync_legacy();
            settings_loaded = true;
            pad_color_check();
            redraw = true;
            if (oled_ok) {
                apply_contrast();
            }
        }
    }
    if (settings_loaded && !audio_settings_loaded) {
        audio_settings_load();
    }

    if (save_pending && (t - save_req_ms) >= SETTINGS_SAVE_DELAY_MS) {
        save_pending = false;
        settings_save();
    }

    bool audio_save_due;
    portENTER_CRITICAL(&audio_cfg_mux);
    audio_save_due = audio_save_pending && !audio_save_blocked &&
                     (t - audio_save_req_ms) >= SETTINGS_SAVE_DELAY_MS;
    portEXIT_CRITICAL(&audio_cfg_mux);

    if (audio_save_due) {
        audio_settings_save();
    }

    enter_stage(compute_stage((t - last_act_ms) / 1000), t);
    if (!oled_ok) {
        return;
    }
    if (stage == STG_SAVER) {
        if (cfg.saver_mode >= SAVER_COUNT && cfg.saver_cycle_s &&
            (t - saver_t0_ms) / 1000 >= cfg.saver_cycle_s) {
            auto_idx = saver_next_enabled(auto_idx, 1);
            saver_pick_and_start(t);
        }
        saver_step(saver_cur);
        oled_flush();
    }
    else if (stage != STG_OFF) {
        if (toast_until_ms && (int32_t)(toast_until_ms - t) <= 0) {
            toast_until_ms = 0;
            redraw = true;
        }
        if (cfg.pixel_shift && (t - shift_t0_ms) / 1000 >= PIXEL_SHIFT_PERIOD_S) {
            shift_idx = (uint8_t)((shift_idx + 1) & 3);
            shift_t0_ms = t;
            redraw = true;
        }
        if (redraw) {
            uint8_t page = (pages_cnt && page_cur < pages_cnt) ? pages_enabled[page_cur] : 0;

            render_page(page);
            oled_flush();
            redraw = false;
        }
    }
}

/* ---------------- Events ---------------- */

static void saver_move(int dir) {
    auto_idx = saver_next_enabled(auto_idx, dir);
    forced_saver = true;        /* A swipe wins over the idle timer and over a fixed saver_mode */
    if (stage == STG_SAVER) {   /* Already showing one: switch right now */
        saver_cur = (saver_id_t)auto_idx;
        saver_start(saver_cur);
        saver_t0_ms = now_ms(); /* Restart the auto cycle timer */
    }
    /* Otherwise update() enters the screensaver stage with this one */
}

static void page_move(int dir) {
    if (!pages_cnt) {
        return;
    }
    page_cur = (uint8_t)((page_cur + pages_cnt + dir) % pages_cnt);
    forced_saver = false;
    redraw = true;
}

/* Apply MX OLED geometry (panel height + rotation). Runs in the UI task only:
   the SSD1306 is bit-banged from here, so geometry must not be changed while
   another task might be mid-flush. */
static void mx_geom_apply(void) {
    const struct mx_oled_cfg *mo = mx_cfg_oled();

    if (mo == NULL) {
        return;
    }

    if (mo->panel_h == 32 || mo->panel_h == 64) {
        if ((int)mo->panel_h != gfx_h()) {
            gfx_set_panel_h(mo->panel_h);
            if (oled_ok) {
                oled_apply_geometry();
            }
            redraw = true;
        }
    }
    if (mo->rotation <= 1 && mo->rotation != oled_rotation) {
        oled_rotation = mo->rotation;
        if (oled_ok) {
            oled_apply_geometry();
        }
        redraw = true;
    }
    mx_geom_pending = 0;
}

static void handle_msg(const ui_msg_t *msg) {
    bool activity = true;
    bool keep_forced = false;

    switch (msg->evt) {
        case UI_EVT_BOOT:
            redraw = true;
            play_sound(UI_SND_BOOT);
            break;
        case UI_EVT_PAIRING_START:
            if (st != ST_ERROR) {
                st = ST_PAIRING;
            }
            redraw = true;
            play_sound(UI_SND_PAIR_START);
            break;
        case UI_EVT_PAIRING_STOP:
            if (st != ST_ERROR) {
                st = ST_READY;
            }
            redraw = true;
            play_sound(UI_SND_PAIR_STOP);
            break;
        case UI_EVT_ERROR:
            st = ST_ERROR;
            redraw = true;
            play_sound(UI_SND_ERROR);
            break;
        case UI_EVT_PADS:
            if (msg->val != pads) {
                bool up = msg->val > pads;

                pads = msg->val;
                redraw = true;
                play_sound(up ? UI_SND_CONNECT : UI_SND_DISCONNECT);
            }
            break;
        case UI_EVT_SAVER_NEXT:
            saver_move(1);
            keep_forced = true;
            break;
        case UI_EVT_SAVER_PREV:
            saver_move(-1);
            keep_forced = true;
            break;
        case UI_EVT_PAGE_NEXT:
            page_move(1);
            break;
        case UI_EVT_PAGE_PREV:
            page_move(-1);
            break;
        case UI_EVT_TOUCH_SWIPE:
            /* Stage dependent meaning (spec workbook, touchpad sheet):
               screensaver stage: left/right = previous/next screensaver, up/down = color
               active stage:      left/right = pad 1/2 battery toast, up/down = color */
            if (stage == STG_SAVER || forced_saver) {
                switch (msg->val) {
                    case UI_SWIPE_LEFT:
                        saver_move(1);
                        break;
                    case UI_SWIPE_RIGHT:
                        saver_move(-1);
                        break;
                    case UI_SWIPE_UP:
                    case UI_SWIPE_DOWN:
                        /* Repost as a color event (keep the source port) */
                        handle_msg(&(ui_msg_t){
                            .evt = (msg->val == UI_SWIPE_UP) ? UI_EVT_COLOR_NEXT : UI_EVT_COLOR_PREV,
                            .val = 0, .val2 = msg->val2 });
                        break;
                    default:
                        break;
                }
                keep_forced = true;
            }
            else {
                switch (msg->val) {
                    case UI_SWIPE_LEFT:     /* Right -> left: next info page */
                        page_move(1);
                        break;
                    case UI_SWIPE_RIGHT:    /* Left -> right: previous info page */
                        page_move(-1);
                        break;
                    case UI_SWIPE_UP:
                        handle_msg(&(ui_msg_t){ .evt = UI_EVT_COLOR_NEXT, .val = 0, .val2 = msg->val2 });
                        break;
                    case UI_SWIPE_DOWN:
                        handle_msg(&(ui_msg_t){ .evt = UI_EVT_COLOR_PREV, .val = 0, .val2 = msg->val2 });
                        break;
                    default:
                        break;
                }
            }
            break;
        case UI_EVT_COLOR_NEXT:
        case UI_EVT_COLOR_PREV: {
            int dir = (msg->evt == UI_EVT_COLOR_NEXT) ? 1 : -1;
            int idx = (preset_idx == 0xFF) ? ((dir > 0) ? 0 : PAD_PRESET_COUNT - 1)
                                           : ((int)preset_idx + PAD_PRESET_COUNT + dir) % PAD_PRESET_COUNT;

            cfg.pad_color_mode = 1;
            memcpy(cfg.pad_rgb, pad_presets[idx].rgb, 3);
            pad_color_check();
            save_pending = true;
            save_req_ms = now_ms();

            /* Per-port color: write the MX LED slot so the color targets the
               swiped pad only and stays in sync with the WebApp panel. */
            mx_led_set_port_color((msg->val2 < MX_LED_PORTS) ? (uint8_t)msg->val2 : 0,
                                  pad_presets[idx].rgb);

            /* Push the new color to every connected pad right away (the manager
               poll is a backstop, this makes the change instant). */
            manager_send_pad_colors();

            snprintf(toast_buf, sizeof(toast_buf), "COLOR: %s", pad_presets[idx].name);
            toast_until_ms = now_ms() + TOAST_MS;
            redraw = true;
            break;
        }
        case UI_EVT_SAVER_ENTER:
            /* Shortcut: put the OLED in screensaver mode now */
            forced_saver = true;
            auto_idx = (cfg.saver_mode < SAVER_COUNT && saver_id_enabled(cfg.saver_mode)) ? cfg.saver_mode : auto_idx;
            if (stage == STG_SAVER) {
                saver_pick_and_start(now_ms());
            }
            keep_forced = true;     /* Do not let the activity reset undo it */
            break;
        case UI_EVT_MENU_ENTER:
            /* Shortcut: back to the main menu pages (wakes the display) */
            forced_saver = false;
            page_cur = 0;
            redraw = true;
            break;
        case UI_EVT_SETTINGS:
            settings_sanitize();
            audio_settings_sync_legacy();
            pad_color_check();
            if (mx_geom_pending) {
                mx_geom_apply();
            }
            save_pending = true;
            save_req_ms = now_ms();
            if (oled_ok) {
                apply_contrast();
            }
            redraw = true;
            break;
        case UI_EVT_SOUND_TEST: {
            ui_audio_settings_t settings = audio_settings_snapshot();
            if (settings.enabled && msg->val < UI_MELODY_COUNT) {
                audio_request(msg->val, settings.volume);
            }
            break;
        }
        case UI_EVT_ACTIVITY:
        default:
            break;
    }
    if (activity) {
        last_act_ms = now_ms();
        if (!keep_forced) {
            forced_saver = false;
        }
    }
}

/* ---------------- Task ---------------- */

static void ui_task(void *param) {
    ui_msg_t msg;

    (void)param;
    i2c_pins_init();
    oled_ok = oled_init();
    saver_seed(esp_random());
    last_act_ms = shift_t0_ms = saver_t0_ms = now_ms();
    if (oled_ok) {
        gfx_clear();
        oled_flush();
    }
    else {
        printf("UI: OLED not found at 0x%02X (SCL %d SDA %d), buzzer only\n",
            UI_OLED_ADDR, UI_SCL_PIN, UI_SDA_PIN);
    }

    while (1) {
        TickType_t wait = (stage == STG_SAVER) ? pdMS_TO_TICKS(SAVER_FRAME_MS) : pdMS_TO_TICKS(1000);

        if (xQueueReceive(ui_q, &msg, wait) == pdTRUE) {
            handle_msg(&msg);
        }
        update();
    }
}

void ui_init(void) {
    ui_q = xQueueCreate(8, sizeof(ui_msg_t));
    if (ui_q == NULL) {
        return;
    }

    audio_q = xQueueCreate(1, sizeof(audio_req_t));
    audio_preview_q = xQueueCreate(1, sizeof(audio_req_t));

    if (audio_q == NULL || audio_preview_q == NULL) {
        if (audio_q) {
            vQueueDelete(audio_q);
            audio_q = NULL;
        }
        if (audio_preview_q) {
            vQueueDelete(audio_preview_q);
            audio_preview_q = NULL;
        }
        vQueueDelete(ui_q);
        ui_q = NULL;
        return;
    }

    if (xTaskCreatePinnedToCore(&ui_task, "ui_task", 4096, NULL, 2, NULL, 0) != pdPASS) {
        vQueueDelete(audio_q);
        audio_q = NULL;
        vQueueDelete(audio_preview_q);
        audio_preview_q = NULL;
        vQueueDelete(ui_q);
        ui_q = NULL;
        return;
    }

    if (xTaskCreatePinnedToCore(&audio_task, "audio_task", 3072, NULL, 2,
                                &audio_task_handle, 0) != pdPASS) {
        audio_task_handle = NULL;
        vQueueDelete(audio_q);
        audio_q = NULL;
        vQueueDelete(audio_preview_q);
        audio_preview_q = NULL;
    }

    ui_event(UI_EVT_BOOT);
}

void ui_event(ui_evt_t evt) {
    ui_msg_t msg = { .evt = (uint8_t)evt, .val = 0 };

    if (ui_q) {
        xQueueSend(ui_q, &msg, 0);
    }
}

void ui_set_pads(uint8_t count) {
    ui_msg_t msg = { .evt = UI_EVT_PADS, .val = count };

    if (ui_q) {
        xQueueSend(ui_q, &msg, 0);
    }
}

void ui_play_sound(uint8_t melody) {
    ui_msg_t msg = { .evt = UI_EVT_SOUND_TEST, .val = melody };

    if (ui_q) {
        xQueueSend(ui_q, &msg, 0);
    }
}

const char *ui_melody_name(uint8_t melody) {
    return (melody < UI_MELODY_COUNT) ? melodies[melody].name : "";
}

bool ui_pad_color_get(uint32_t *rgb) {
    if (!cfg.pad_color_mode) {
        return false;
    }
    if (rgb) {
        *rgb = (uint32_t)cfg.pad_rgb[0] | ((uint32_t)cfg.pad_rgb[1] << 8) | ((uint32_t)cfg.pad_rgb[2] << 16);
    }
    return true;
}

uint32_t ui_pad_color_generation(void) {
    return pad_gen;
}

/* DualShock 4 touchpad gestures. Runs in the Bluetooth task for every input report, so it only
   keeps a few numbers and posts an event when a swipe is complete. The UI task decides what a
   swipe means based on the display stage (screensaver vs active). */
#define SWIPE_X_MIN 500     /* Touchpad is 1920 x 942 units: about a quarter of each axis */
#define SWIPE_Y_MIN 250

static struct {
    bool down;
    bool click;
    int x0, y0, x, y;
    uint8_t src;            /* out_idx of the pad feeding the touch */
} touch;

void ui_touch_feed(uint8_t valid, uint8_t down, uint16_t x, uint16_t y, uint8_t click, uint8_t src_port) {
    if (src_port != 0xFF) {
        touch.src = src_port;
    }
    if (click && !touch.click) {
        ui_event(UI_EVT_ACTIVITY);      /* Pressing the touchpad wakes the display / leaves a screensaver */
    }
    touch.click = click;
    if (!valid) {
        return;
    }
    if (down) {
        if (!touch.down) {
            touch.down = true;
            touch.x0 = x;
            touch.y0 = y;
        }
        touch.x = x;
        touch.y = y;
        return;
    }
    if (!touch.down) {
        return;
    }
    touch.down = false;

    int dx = touch.x - touch.x0;
    int dy = touch.y - touch.y0;
    int ax = abs(dx);
    int ay = abs(dy);
    ui_msg_t msg = { .evt = UI_EVT_TOUCH_SWIPE, .val = 0, .val2 = touch.src };

    if (ax >= SWIPE_X_MIN && ax > 2 * ay) {
        msg.val = (dx > 0) ? UI_SWIPE_RIGHT : UI_SWIPE_LEFT;
    }
    else if (ay >= SWIPE_Y_MIN && ay > 2 * ax) {
        msg.val = (dy < 0) ? UI_SWIPE_UP : UI_SWIPE_DOWN;   /* y grows downward */
    }
    else {
        return;
    }

    if (ui_q) {
        xQueueSend(ui_q, &msg, 0);
    }
}

void ui_settings_get(ui_settings_t *out) {
    if (out) {
        memcpy(out, &cfg, sizeof(cfg));
    }
}

void ui_settings_set(const ui_settings_t *in) {
    if (in) {
        memcpy(&cfg, in, sizeof(cfg));
        ui_event(UI_EVT_SETTINGS);
    }
}

bool ui_audio_settings_get(ui_audio_settings_t *out) {
    if (!out) {
        return false;
    }
    *out = audio_settings_snapshot();
    return true;
}

bool ui_audio_settings_set(const ui_audio_settings_t *in) {
    if (!in || in->enabled > 1 || in->volume > 100) {
        return false;
    }

    for (int i = 0; i < UI_SND_COUNT; i++) {
        if (in->sound[i] >= UI_MELODY_COUNT) {
            return false;
        }
    }

    portENTER_CRITICAL(&audio_cfg_mux);
    audio_cfg = *in;
    audio_cfg_overridden = true;
    portEXIT_CRITICAL(&audio_cfg_mux);

    audio_settings_mark_save();

    if (!in->enabled) {
        audio_notify(AUDIO_NOTIFY_STOP_ALL);
    }

    return true;
}


bool ui_audio_preview(uint8_t melody) {
    if (melody >= UI_MELODY_COUNT || !audio_task_handle || !audio_preview_q) {
        return false;
    }

    ui_audio_settings_t settings = audio_settings_snapshot();
    if (!settings.enabled) {
        return false;
    }

    audio_req_t req = {
        .melody = melody,
        .volume = settings.volume,
        .type = AUDIO_REQ_PREVIEW,
    };

    if (xQueueOverwrite(audio_preview_q, &req) != pdPASS) {
        return false;
    }

    audio_notify(AUDIO_NOTIFY_REQUEST);
    return true;
}

bool ui_audio_preview_stop(void) {
    if (!audio_task_handle || !audio_preview_q) {
        return false;
    }

    xQueueReset(audio_preview_q);
    audio_notify(AUDIO_NOTIFY_STOP_PREVIEW);
    return true;
}

void ui_audio_preview_disconnect(void) {
    (void)ui_audio_preview_stop();
}

void ui_play_event(uint8_t evt) {
    /* Play the melody mapped to this event right away (power off / reset).
       Not queued through ui_q: the manager task calls this right before it
       cuts the power, so the buzzer request must go out immediately. */
    if (evt < UI_SND_COUNT) {
        ui_audio_settings_t settings = audio_settings_snapshot();

        if (settings.enabled) {
            audio_request(settings.sound[evt], settings.volume);
        }
    }
}

void ui_color_flash_start(uint8_t out_idx) {
    color_flash.out_idx = out_idx;
    color_flash.t0_ms = now_ms();
    color_flash.active = 1;
}

void ui_color_flash_stop(uint8_t out_idx) {
    if (color_flash.active && color_flash.out_idx == out_idx) {
        color_flash_reset();
    }
}

bool ui_color_flash_get(uint8_t out_idx, uint32_t *rgb) {
    if (!color_flash.active || color_flash.out_idx != out_idx) {
        return false;
    }

    int phase = color_flash_phase(now_ms());

    if (phase >= 2) {
        color_flash_reset();
        return false;
    }
    if (rgb) {
        /* Red, then orange, then the regular color takes over */
        *rgb = phase ? 0x0060FF : 0x0000FF;   /* R | G << 8 | B << 16 */
    }
    return true;
}

void ui_battery_set(uint8_t out_idx, uint8_t percent) {
    if (out_idx < UI_BATT_PORTS) {
        battery_pct[out_idx] = percent;
    }
}

uint8_t ui_battery_get(uint8_t out_idx) {
    return (out_idx < UI_BATT_PORTS) ? battery_pct[out_idx] : 0xFF;
}

/* Push the MX config slots into the UI/audio settings.
   Called after boot (main.c) and after every MX slot write from BLE (att_cfg.c). */
void ui_mx_apply(void) {
    const struct mx_audio_cfg *ma = mx_cfg_audio();
    const struct mx_oled_cfg *mo = mx_cfg_oled();
    const struct mx_idle_cfg *mi = mx_cfg_idle();

    if (ma) {
        ui_audio_settings_t a;

        ui_audio_settings_get(&a);
        a.enabled = ma->enabled ? 1 : 0;
        a.volume = ma->volume;
        a.sound[UI_SND_BOOT] = ma->ev_power_on;
        a.sound[UI_SND_CONNECT] = ma->ev_bt_connect;
        a.sound[UI_SND_DISCONNECT] = ma->ev_bt_disconnect;
        a.sound[UI_SND_POWER_OFF] = ma->ev_power_off;
        a.sound[UI_SND_RESET] = ma->ev_reset;
        ui_audio_settings_set(&a);
    }

    if (mo) {
        /* Pages list, filtered to the pages this firmware renders */
        uint8_t n = 0;

        for (int i = 0; i < MX_OLED_PAGES_MAX && i < mo->page_cnt; i++) {
            if (mo->pages[i] < PAGE_MAX) {
                pages_enabled[n++] = mo->pages[i];
            }
        }
        if (n) {
            pages_cnt = n;
            if (page_cur >= pages_cnt) {
                page_cur = 0;
            }
        }

        /* Panel height + rotation: applied inside the UI task (SSD1306 bus) */
        mx_geom_pending = 1;
        ui_event(UI_EVT_SETTINGS);
    }

    if (mi) {
        if (mi->mode == MX_IDLE_OFF) {
            cfg.saver_after_s = 0;                  /* No screensaver */
        }
        else if (mi->mode <= MX_IDLE_LOGO_PLAYSTATION) {
            cfg.saver_mode = (uint8_t)(mi->mode - 1);   /* MX mode N -> saver N-1 */
            if (mi->idle_timeout) {
                cfg.saver_after_s = mi->idle_timeout;
            }
        }
        ui_event(UI_EVT_SETTINGS);
    }
}

#else /* Not a PS1/PS2 build: do nothing, so other configs are unaffected */

void ui_init(void) {}
void ui_event(ui_evt_t evt) { (void)evt; }
void ui_set_pads(uint8_t count) { (void)count; }
void ui_play_sound(uint8_t melody) { (void)melody; }
bool ui_pad_color_get(uint32_t *rgb) { (void)rgb; return false; }
uint32_t ui_pad_color_generation(void) { return 0; }
void ui_touch_feed(uint8_t valid, uint8_t down, uint16_t x, uint16_t y, uint8_t click, uint8_t src_port) {
    (void)valid; (void)down; (void)x; (void)y; (void)click; (void)src_port;
}
const char *ui_melody_name(uint8_t melody) { (void)melody; return ""; }
void ui_settings_get(ui_settings_t *out) { if (out) { memset(out, 0, sizeof(*out)); } }
void ui_settings_set(const ui_settings_t *in) { (void)in; }
bool ui_audio_settings_get(ui_audio_settings_t *out) {
    if (out) { memset(out, 0, sizeof(*out)); }
    return false;
}
bool ui_audio_settings_set(const ui_audio_settings_t *in) {
    (void)in;
    return false;
}
bool ui_audio_preview(uint8_t melody) { (void)melody; return false; }
bool ui_audio_preview_stop(void) { return false; }
void ui_audio_preview_disconnect(void) {}
void ui_mx_apply(void) {}
void ui_play_event(uint8_t evt) { (void)evt; }
void ui_color_flash_start(uint8_t out_idx) { (void)out_idx; }
void ui_color_flash_stop(uint8_t out_idx) { (void)out_idx; }
bool ui_color_flash_get(uint8_t out_idx, uint32_t *rgb) { (void)out_idx; (void)rgb; return false; }
void ui_battery_set(uint8_t out_idx, uint8_t percent) { (void)out_idx; (void)percent; }
uint8_t ui_battery_get(uint8_t out_idx) { (void)out_idx; return 0xFF; }

#endif
