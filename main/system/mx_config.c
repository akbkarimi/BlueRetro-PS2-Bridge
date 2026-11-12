#include <string.h>
#include <stdbool.h>
#include <stdint.h>

#include <esp_err.h>
#include <nvs.h>
#include <nvs_flash.h>
#include <esp_timer.h>

#include "mx_config.h"
#include "adapter/adapter.h"

#define MX_NVS_NS "mx_cfg"

/* Only discrete gameplay buttons are valid shortcut inputs. Analog-axis
 * direction bits (0..7) are intentionally excluded. */
#define MX_KEYS_ALLOWED_BUTTONS (\
    (1U << PAD_LD_LEFT) | (1U << PAD_LD_RIGHT) | \
    (1U << PAD_LD_DOWN) | (1U << PAD_LD_UP) | \
    (1U << PAD_RB_LEFT) | (1U << PAD_RB_RIGHT) | \
    (1U << PAD_RB_DOWN) | (1U << PAD_RB_UP) | \
    (1U << PAD_RD_LEFT) | (1U << PAD_RD_RIGHT) | \
    (1U << PAD_RD_DOWN) | (1U << PAD_RD_UP) | \
    (1U << PAD_MM) | (1U << PAD_LM) | (1U << PAD_LS) | \
    (1U << PAD_LT) | (1U << PAD_LJ) | (1U << PAD_RM) | \
    (1U << PAD_RS) | (1U << PAD_RT) | (1U << PAD_RJ))

static struct mx_audio_cfg audio_cfg;
static struct mx_oled_cfg oled_cfg;
static struct mx_led_cfg led_cfg;
static struct mx_idle_cfg idle_cfg;
static struct mx_time_cfg time_cfg;
static struct mx_features_cfg features_cfg;
static struct mx_keys_cfg keys_cfg;
static struct mx_mac_cfg mac_cfg;
static int64_t time_tick_us;

static bool mx_time_cfg_valid(const struct mx_time_cfg *t)
{
    static const uint8_t month_days[] = {
        31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    };

    if (!t || t->year < 2000 || t->year > 2099 ||
        t->month < 1 || t->month > 12 ||
        t->hour > 23 || t->minute > 59 || t->second > 59) {
        return false;
    }

    uint8_t days = month_days[t->month - 1];
    bool leap = ((t->year % 4) == 0 &&
                 ((t->year % 100) != 0 || (t->year % 400) == 0));
    if (t->month == 2 && leap) days = 29;
    return t->day >= 1 && t->day <= days;
}

static bool mx_keys_cfg_valid(const struct mx_keys_cfg *cfg)
{
    if (!cfg || cfg->version != MX_KEYS_VERSION || cfg->count > MX_KEYS_ACTION_MAX) {
        return false;
    }

    for (uint8_t n = 0; n < cfg->count; n++) {
        const struct mx_shortcut_entry *e = &cfg->entries[n];
        if (e->action < MX_SC_SAVER_ENTER || e->action > MX_SC_DISCONNECT_ALL ||
            e->trigger > MX_SC_TRIGGER_RELEASE || e->enabled > 1 || e->reserved != 0) {
            return false;
        }
        if (e->trigger == MX_SC_TRIGGER_HOLD) {
            if (e->hold_ms < 100 || e->hold_ms > 5000) return false;
        }
        else if (e->hold_ms != 0) {
            return false;
        }

        if (!e->enabled) continue;
        /* Home is mandatory. Home+Start and Home+Share are reserved system
         * commands and may not be shadowed by configurable actions. */
        if ((e->buttons & (1U << PAD_MM)) == 0 ||
            (e->buttons & ((1U << PAD_MT) | (1U << PAD_MS))) != 0 ||
            (e->buttons & ~MX_KEYS_ALLOWED_BUTTONS) != 0 ||
            __builtin_popcount(e->buttons) < 2) {
            return false;
        }

        for (uint8_t j = 0; j < n; j++) {
            const struct mx_shortcut_entry *prev = &cfg->entries[j];
            if (prev->enabled &&
                (((prev->buttons & e->buttons) == prev->buttons) ||
                 ((prev->buttons & e->buttons) == e->buttons))) {
                return false;
            }
        }
    }
    return true;
}

static uint8_t selected_slot = MX_SLOT_AUDIO;
static uint32_t led_generation = 1;     /* Bumped on every LED slot change */

static bool mx_mac_address_valid_for_bt(const uint8_t mac[6])
{
    uint8_t base[6];
    uint64_t address = 0;
    uint8_t any = 0;

    if (!mac || (mac[0] & 1U)) {
        return false;
    }

    for (uint32_t i = 0; i < 6; i++) {
        address = (address << 8) | mac[i];
    }

    /* The Bluetooth address is base MAC + 2; reject underflow explicitly. */
    if (address < 2) {
        return false;
    }
    address -= 2;

    for (int32_t i = 5; i >= 0; i--) {
        base[i] = (uint8_t)(address & 0xFFU);
        address >>= 8;
        any |= base[i];
    }

    return any != 0 && (base[0] & 1U) == 0;
}

static void mx_config_defaults(void)
{
    static const uint8_t led_defaults[MX_LED_PORTS][3] = {
        {0x00, 0x44, 0xFF},
        {0xFF, 0x00, 0x44},
        {0x00, 0xDD, 0x44},
        {0xFF, 0xCC, 0x00},
        {0xFF, 0x66, 0x00},
        {0xAA, 0x00, 0xFF},
        {0xFF, 0xFF, 0xFF},
        {0x00, 0xCC, 0xFF},
    };

    memset(&audio_cfg, 0, sizeof(audio_cfg));
    audio_cfg.enabled = 1;
    audio_cfg.volume = 70;
    audio_cfg.ev_power_on = 14;        /* PS2_BOOT */
    audio_cfg.ev_power_off = 8;        /* GAME_OVER */
    audio_cfg.ev_reset = 26;           /* ALERT */
    audio_cfg.ev_bt_connect = 24;      /* TADA */
    audio_cfg.ev_bt_disconnect = 20;   /* BEEP3 */

    memset(&oled_cfg, MX_OLED_PAGE_EMPTY, sizeof(oled_cfg));
    oled_cfg.enabled = 1;
    oled_cfg.rotation = 0;
    oled_cfg.panel_h = 32;
    oled_cfg.notifications = 1;
    oled_cfg.touchpad_nav = 1;
    oled_cfg.page_cnt = 5;

    for (uint8_t i = 0; i < oled_cfg.page_cnt; i++) {
        oled_cfg.pages[i] = i;
    }

    memset(&led_cfg, 0, sizeof(led_cfg));
    led_cfg.auto_player = 1;
    led_cfg.brightness = 80;
    memcpy(led_cfg.ports, led_defaults, sizeof(led_defaults));

    idle_cfg.mode = MX_IDLE_CUBE;
    idle_cfg.idle_timeout = 30;

    memset(&keys_cfg, 0, sizeof(keys_cfg));
    keys_cfg.version = MX_KEYS_VERSION;
    keys_cfg.count = 6;
    /* Defaults are deliberately Home-modified so ordinary gameplay buttons
       (L3/R3, shoulders and face buttons) are never consumed as shortcuts. */
    keys_cfg.entries[0] = (struct mx_shortcut_entry){ MX_SC_SAVER_ENTER, MX_SC_TRIGGER_PRESS, 1, 0, (1U << PAD_MM) | (1U << PAD_LD_RIGHT), 0 };
    keys_cfg.entries[1] = (struct mx_shortcut_entry){ MX_SC_MENU_ENTER, MX_SC_TRIGGER_PRESS, 1, 0, (1U << PAD_MM) | (1U << PAD_LD_LEFT), 0 };
    keys_cfg.entries[2] = (struct mx_shortcut_entry){ MX_SC_PAGE_NEXT, MX_SC_TRIGGER_PRESS, 1, 0, (1U << PAD_MM) | (1U << PAD_LD_DOWN), 0 };
    keys_cfg.entries[3] = (struct mx_shortcut_entry){ MX_SC_PAGE_PREV, MX_SC_TRIGGER_PRESS, 1, 0, (1U << PAD_MM) | (1U << PAD_LD_UP), 0 };
    keys_cfg.entries[4] = (struct mx_shortcut_entry){ MX_SC_SAVER_NEXT, MX_SC_TRIGGER_HOLD, 0, 0, (1U << PAD_MM) | (1U << PAD_LD_DOWN), 1000 };
    keys_cfg.entries[5] = (struct mx_shortcut_entry){ MX_SC_SAVER_PREV, MX_SC_TRIGGER_HOLD, 0, 0, (1U << PAD_MM) | (1U << PAD_LD_UP), 1000 };

    /* Default time for the clock screensavers: 12:00, Jan 1st 2026 */
    time_cfg.year = 2026;
    time_cfg.month = 1;
    time_cfg.day = 1;
    time_cfg.hour = 12;
    time_cfg.minute = 0;
    time_cfg.second = 0;

    features_cfg.bits = 0x7F;

    memset(&mac_cfg, 0, sizeof(mac_cfg));
    mac_cfg.magic = 0x4D;
}

/* Keep every event melody inside the 27-melody table */
static void audio_sanitize(struct mx_audio_cfg *a) {
    uint8_t *ev[5] = {
        &a->ev_power_on, &a->ev_power_off, &a->ev_reset,
        &a->ev_bt_connect, &a->ev_bt_disconnect,
    };

    if (a->enabled > 1) {
        a->enabled = 1;
    }
    if (a->volume > 100) {
        a->volume = 100;
    }
    for (uint32_t i = 0; i < 5; i++) {
        if (*ev[i] >= MX_MELODY_COUNT) {
            *ev[i] = 0;
        }
    }
}

static bool mx_nvs_load(const char *key, void *dst, size_t expected)
{
    nvs_handle_t h;
    size_t len = expected;

    if (nvs_open(MX_NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        return false;
    }

    esp_err_t err = nvs_get_blob(h, key, dst, &len);
    nvs_close(h);

    return err == ESP_OK && len == expected;
}

static bool mx_nvs_save(const char *key, const void *src, size_t len)
{
    nvs_handle_t h;

    if (nvs_open(MX_NVS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return false;
    }

    esp_err_t err = nvs_set_blob(h, key, src, len);

    if (err == ESP_OK) {
        err = nvs_commit(h);
    }

    nvs_close(h);
    return err == ESP_OK;
}

/* Deferred NVS save: BLE writes must never run flash I/O inside the
   Bluetooth task (unicore build -> BT timing violations -> random
   controller disconnects). Slots are marked dirty and committed later
   from the manager task via mx_config_flush(). */
static uint16_t mx_dirty_slots = 0;
static int64_t mx_save_req_ms = 0;

static void mx_config_request_save(uint8_t slot) {
    if (slot < MX_SLOT_LAST) {
        mx_dirty_slots |= (uint16_t)(1U << slot);
        mx_save_req_ms = esp_timer_get_time() / 1000;
    }
}

void mx_config_flush(void) {
    if (!mx_dirty_slots) {
        return;
    }

    int64_t now = esp_timer_get_time() / 1000;

    if (now - mx_save_req_ms < 1500) {
        return;                     /* Debounce: wait for writes to settle */
    }

    if (mx_dirty_slots & (1U << MX_SLOT_AUDIO)) {
        if (mx_nvs_save("audio", &audio_cfg, sizeof(audio_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_AUDIO);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_OLED)) {
        if (mx_nvs_save("oled", &oled_cfg, sizeof(oled_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_OLED);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_LED)) {
        if (mx_nvs_save("led", &led_cfg, sizeof(led_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_LED);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_IDLE)) {
        if (mx_nvs_save("idle", &idle_cfg, sizeof(idle_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_IDLE);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_FEATURES)) {
        if (mx_nvs_save("feat", &features_cfg, sizeof(features_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_FEATURES);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_TIME)) {
        if (mx_nvs_save("time", &time_cfg, sizeof(time_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_TIME);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_KEYS)) {
        if (mx_nvs_save("keys", &keys_cfg, sizeof(keys_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_KEYS);
        }
    }
    if (mx_dirty_slots & (1U << MX_SLOT_MAC)) {
        if (mx_nvs_save("mac", &mac_cfg, sizeof(mac_cfg))) {
            mx_dirty_slots &= (uint16_t)~(1U << MX_SLOT_MAC);
        }
    }
}

void mx_led_set_port_color(uint8_t port, const uint8_t rgb[3]) {
    if (port >= MX_LED_PORTS || !rgb) {
        return;
    }

    led_cfg.auto_player = 0;
    led_cfg.ports[port].r = rgb[0];
    led_cfg.ports[port].g = rgb[1];
    led_cfg.ports[port].b = rgb[2];
    led_generation++;
    mx_config_request_save(MX_SLOT_LED);
}

uint32_t mx_led_generation_get(void) {
    return led_generation;
}

static void mx_config_load_all(void)
{
    struct mx_audio_cfg a;
    struct mx_oled_cfg o;
    struct mx_led_cfg l;
    struct mx_idle_cfg i;
    struct mx_features_cfg f;
    struct mx_keys_cfg k;

    if (mx_nvs_load("audio", &a, sizeof(a))) {
        audio_sanitize(&a);
        audio_cfg = a;
    }

    uint8_t oled_data[sizeof(struct mx_oled_cfg)];
    nvs_handle_t h;

    if (nvs_open(MX_NVS_NS, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(oled_data);
        esp_err_t err = nvs_get_blob(h, "oled", oled_data, &len);
        nvs_close(h);

        if (err == ESP_OK && len >= 6 &&
            len <= sizeof(oled_data) &&
            oled_data[0] <= 1 &&
            oled_data[1] <= 3 &&
            (oled_data[2] == 32 || oled_data[2] == 64) &&
            oled_data[3] <= 1 &&
            oled_data[4] <= 1 &&
            oled_data[5] <= MX_OLED_PAGES_MAX &&
            len == (size_t)(6 + oled_data[5])) {
            struct mx_oled_cfg tmp = oled_cfg;
            memcpy(&tmp, oled_data, len);
            oled_cfg = tmp;
        }
    }

    if (mx_nvs_load("led", &l, sizeof(l)) &&
        l.auto_player <= 1 && l.brightness <= 100) {
        led_cfg = l;
    }

    if (mx_nvs_load("idle", &i, sizeof(i)) &&
        i.mode <= MX_IDLE_AUTO) {
        idle_cfg = i;
    }

    if (mx_nvs_load("feat", &f, sizeof(f))) {
        features_cfg = f;
    }

    struct mx_time_cfg t;
    if (mx_nvs_load("time", &t, sizeof(t)) && mx_time_cfg_valid(&t)) {
        time_cfg = t;
    }

    if (mx_nvs_load("keys", &k, sizeof(k)) && mx_keys_cfg_valid(&k)) {
        keys_cfg = k;
    }

    struct mx_mac_cfg m;
    if (mx_nvs_load("mac", &m, sizeof(m)) && m.magic == 0x4D && m.enabled <= 1) {
        uint8_t any = 0;
        for (uint32_t i = 0; i < sizeof(m.mac); i++) any |= m.mac[i];
        if (!m.enabled || (any != 0 && mx_mac_address_valid_for_bt(m.mac))) {
            mac_cfg = m;
        }
    }
}

void mx_config_init(void)
{
    mx_config_defaults();
    selected_slot = MX_SLOT_AUDIO;
    mx_config_load_all();
    time_tick_us = esp_timer_get_time();
}

void mx_config_select_slot(uint8_t slot)
{
    if (slot < MX_SLOT_LAST && slot != MX_SLOT_PAGES) {
        selected_slot = slot;
    }
}

uint32_t mx_config_read_blob(uint8_t *dst, uint32_t max)
{
    const void *src = NULL;
    uint32_t len = 0;

    switch (selected_slot) {
    case MX_SLOT_AUDIO:
        src = &audio_cfg;
        len = sizeof(audio_cfg);
        break;

    case MX_SLOT_OLED:
        src = &oled_cfg;
        len = 6 + oled_cfg.page_cnt;
        break;

    case MX_SLOT_LED:
        src = &led_cfg;
        len = sizeof(led_cfg);
        break;

    case MX_SLOT_IDLE:
        src = &idle_cfg;
        len = sizeof(idle_cfg);
        break;

    case MX_SLOT_TIME:
        src = &time_cfg;
        len = sizeof(time_cfg);
        break;

    case MX_SLOT_FEATURES:
        src = &features_cfg;
        len = sizeof(features_cfg);
        break;

    case MX_SLOT_KEYS:
        src = &keys_cfg;
        len = sizeof(keys_cfg);
        break;

    case MX_SLOT_MAC:
        src = &mac_cfg;
        len = sizeof(mac_cfg);
        break;

    default:
        return 0;
    }

    if (!dst || max < len) {
        return 0;
    }

    memcpy(dst, src, len);
    return len;
}

int32_t mx_config_write_blob(const uint8_t *src, uint32_t len)
{
    if (!src) {
        return -1;
    }

    switch (selected_slot) {
    case MX_SLOT_AUDIO: {
        struct mx_audio_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        if (tmp.enabled > 1 || tmp.volume > 100) {
            return -1;
        }

        {
            const uint8_t ev_max = MX_MELODY_COUNT - 1;

            if (tmp.ev_power_on > ev_max || tmp.ev_power_off > ev_max ||
                tmp.ev_reset > ev_max || tmp.ev_bt_connect > ev_max ||
                tmp.ev_bt_disconnect > ev_max) {
                return -1;
            }
        }

        mx_config_request_save(MX_SLOT_AUDIO);

        audio_cfg = tmp;
        return 0;
    }

    case MX_SLOT_OLED: {
        struct mx_oled_cfg tmp = oled_cfg;

        if (len < 6 || len > sizeof(tmp) ||
            src[0] > 1 || src[1] > 3 ||
            (src[2] != 32 && src[2] != 64) ||
            src[3] > 1 || src[4] > 1 ||
            src[5] > MX_OLED_PAGES_MAX ||
            len != (uint32_t)(6 + src[5])) {
            return -1;
        }

        memcpy(&tmp, src, len);

        mx_config_request_save(MX_SLOT_OLED);

        oled_cfg = tmp;
        return 0;
    }

    case MX_SLOT_LED: {
        struct mx_led_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        if (tmp.auto_player > 1 || tmp.brightness > 100) {
            return -1;
        }

        mx_config_request_save(MX_SLOT_LED);

        if (memcmp(&tmp, &led_cfg, sizeof(tmp)) != 0) {
            led_generation++;
        }
        led_cfg = tmp;
        return 0;
    }

    case MX_SLOT_IDLE: {
        struct mx_idle_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        if (tmp.mode > MX_IDLE_AUTO) {
            return -1;
        }

        mx_config_request_save(MX_SLOT_IDLE);

        idle_cfg = tmp;
        return 0;
    }

    case MX_SLOT_TIME: {
        struct mx_time_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));
        if (!mx_time_cfg_valid(&tmp)) {
            return -1;
        }

        time_cfg = tmp;
        time_tick_us = esp_timer_get_time();
        mx_config_request_save(MX_SLOT_TIME);
        return 0;
    }

    case MX_SLOT_FEATURES: {
        struct mx_features_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        mx_config_request_save(MX_SLOT_FEATURES);

        features_cfg = tmp;
        return 0;
    }

    case MX_SLOT_KEYS: {
        struct mx_keys_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        if (!mx_keys_cfg_valid(&tmp)) return -1;

        mx_config_request_save(MX_SLOT_KEYS);

        keys_cfg = tmp;
        return 0;
    }

    case MX_SLOT_MAC: {
        struct mx_mac_cfg tmp;
        uint8_t any = 0;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));
        for (uint32_t i = 0; i < sizeof(tmp.mac); i++) any |= tmp.mac[i];

        if (tmp.magic != 0x4D || tmp.enabled > 1 ||
            (tmp.enabled && (any == 0 || !mx_mac_address_valid_for_bt(tmp.mac)))) {
            return -1;
        }

        mx_config_request_save(MX_SLOT_MAC);
        mac_cfg = tmp;
        return 0;
    }

    case MX_SLOT_PAGES:
    default:
        return -1;
    }
}

const struct mx_audio_cfg *mx_cfg_audio(void)
{
    return &audio_cfg;
}

const struct mx_oled_cfg *mx_cfg_oled(void)
{
    return &oled_cfg;
}

const struct mx_led_cfg *mx_cfg_led(void)
{
    return &led_cfg;
}

const struct mx_idle_cfg *mx_cfg_idle(void)
{
    return &idle_cfg;
}

const struct mx_time_cfg *mx_cfg_time(void)
{
    return &time_cfg;
}

const struct mx_features_cfg *mx_cfg_features(void)
{
    return &features_cfg;
}

const struct mx_keys_cfg *mx_cfg_keys(void)
{
    return &keys_cfg;
}

const struct mx_mac_cfg *mx_cfg_mac(void)
{
    return &mac_cfg;
}

void mx_cfg_set_time(const struct mx_time_cfg *t)
{
    if (mx_time_cfg_valid(t)) {
        time_cfg = *t;
        time_tick_us = esp_timer_get_time();
        mx_config_request_save(MX_SLOT_TIME);
    }
}

bool mx_cfg_time_tick(void)
{
    int64_t now = esp_timer_get_time();
    if (!time_tick_us) {
        time_tick_us = now;
        return false;
    }

    int64_t elapsed = (now - time_tick_us) / 1000000;
    if (elapsed <= 0) {
        return false;
    }
    time_tick_us += elapsed * 1000000;

    while (elapsed-- > 0) {
        if (++time_cfg.second < 60) continue;
        time_cfg.second = 0;
        if (++time_cfg.minute < 60) continue;
        time_cfg.minute = 0;
        if (++time_cfg.hour < 24) continue;
        time_cfg.hour = 0;

        static const uint8_t month_days[] = {
            31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
        };
        uint8_t days = month_days[time_cfg.month - 1];
        bool leap = ((time_cfg.year % 4) == 0 &&
                     ((time_cfg.year % 100) != 0 || (time_cfg.year % 400) == 0));
        if (time_cfg.month == 2 && leap) days = 29;
        if (++time_cfg.day <= days) continue;
        time_cfg.day = 1;
        if (++time_cfg.month <= 12) continue;
        time_cfg.month = 1;
        if (++time_cfg.year > 2099) time_cfg.year = 2000;
    }
    return true;
}
