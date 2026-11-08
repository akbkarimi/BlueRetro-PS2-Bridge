#include <string.h>
#include <stdbool.h>
#include <stdint.h>

#include <esp_err.h>
#include <nvs.h>
#include <nvs_flash.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include "mx_config.h"

#define MX_NVS_NS "mx_cfg"

static struct mx_audio_cfg audio_cfg;
static struct mx_oled_cfg oled_cfg;
static struct mx_led_cfg led_cfg;
static struct mx_idle_cfg idle_cfg;
static struct mx_time_cfg time_cfg;     /* Last time set (boot default or WebApp) */
static int64_t time_set_ms;             /* esp_timer ms when time_cfg was set */
static struct mx_time_cfg time_now;     /* Scratch returned by mx_cfg_time() */
static struct mx_features_cfg features_cfg;
static struct mx_keys_cfg keys_cfg;
static struct mx_mac_cfg mac_cfg;

/* The BLE task writes these structs, the UI task and the system manager read them
   (and the manager saves them to NVS). Every access to the shared state below goes
   through this lock; the long NVS I/O itself runs outside of it. */
static portMUX_TYPE mx_mux = portMUX_INITIALIZER_UNLOCKED;

/* ---------------- Software clock (no RTC on the board) ----------------
   The WebApp writes the wall time once; from then on the clock follows
   esp_timer. It restarts at the boot default after every power cycle, so the
   WebApp has to sync it again. */

static bool time_leap(unsigned y)
{
    return ((y % 4U) == 0U && (y % 100U) != 0U) || (y % 400U) == 0U;
}

static unsigned time_days_in_month(unsigned y, unsigned m)
{
    static const uint8_t dim[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

    return (m == 2U && time_leap(y)) ? 29U : dim[(m - 1U) % 12U];
}

static bool time_valid(const struct mx_time_cfg *t)
{
    return t->year >= 2000 && t->year <= 2199 &&
           t->month >= 1 && t->month <= 12 &&
           t->day >= 1 && t->day <= time_days_in_month(t->year, t->month) &&
           t->hour < 24 && t->minute < 60;
}

static void time_current(struct mx_time_cfg *out)
{
    struct mx_time_cfg base;
    int64_t set_ms;

    portENTER_CRITICAL(&mx_mux);
    base = time_cfg;
    set_ms = time_set_ms;
    portEXIT_CRITICAL(&mx_mux);

    int64_t mins = (esp_timer_get_time() / 1000 - set_ms) / 60000;

    *out = base;
    if (mins <= 0 || !time_valid(&base)) {
        return;
    }

    uint64_t total = (uint64_t)base.hour * 60U + base.minute + (uint64_t)mins;
    uint64_t days = total / 1440U;
    unsigned y = base.year, m = base.month, d = base.day;

    total %= 1440U;
    out->hour = (uint8_t)(total / 60U);
    out->minute = (uint8_t)(total % 60U);

    while (days--) {
        if (++d > time_days_in_month(y, m)) {
            d = 1;
            if (++m > 12U) {
                m = 1;
                y++;
            }
        }
    }
    out->year = (uint16_t)y;
    out->month = (uint8_t)m;
    out->day = (uint8_t)d;
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
    oled_cfg.panel_h = 64;
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

    /* Shortcut combos: Home + D-Pad right = screensaver, Home + D-Pad left = main menu */
    keys_cfg.saver_combo = MX_KEYS_COMBO_HOME_RIGHT;
    keys_cfg.menu_combo = MX_KEYS_COMBO_HOME_LEFT;

    /* Default time for the clock screensavers: 12:00, Jan 1st 2026 */
    time_cfg.year = 2026;
    time_cfg.month = 1;
    time_cfg.day = 1;
    time_cfg.hour = 12;
    time_cfg.minute = 0;
    time_set_ms = esp_timer_get_time() / 1000;

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
        portENTER_CRITICAL(&mx_mux);
        mx_dirty_slots |= (uint16_t)(1U << slot);
        mx_save_req_ms = esp_timer_get_time() / 1000;
        portEXIT_CRITICAL(&mx_mux);
    }
}

/* Store a validated slot and mark it dirty as one step (data first, then the request) */
static void mx_commit(uint8_t slot, void *dst, const void *src, size_t n) {
    portENTER_CRITICAL(&mx_mux);
    memcpy(dst, src, n);
    mx_dirty_slots |= (uint16_t)(1U << slot);
    mx_save_req_ms = esp_timer_get_time() / 1000;
    portEXIT_CRITICAL(&mx_mux);
}

void mx_config_flush(void) {
    struct mx_audio_cfg a;
    struct mx_oled_cfg o;
    struct mx_led_cfg l;
    struct mx_idle_cfg i;
    struct mx_features_cfg f;
    struct mx_keys_cfg k;
    struct mx_mac_cfg m;
    uint16_t dirty;
    int64_t now = esp_timer_get_time() / 1000;

    portENTER_CRITICAL(&mx_mux);
    dirty = mx_dirty_slots;
    if (!dirty || now - mx_save_req_ms < 1500) {    /* Debounce: wait for writes to settle */
        portEXIT_CRITICAL(&mx_mux);
        return;
    }
    mx_dirty_slots = 0;
    a = audio_cfg;
    o = oled_cfg;
    l = led_cfg;
    i = idle_cfg;
    f = features_cfg;
    k = keys_cfg;
    m = mac_cfg;
    portEXIT_CRITICAL(&mx_mux);

    /* A failed save re-arms the slot (and the debounce), it does not retry in a tight loop */
    if ((dirty & (1U << MX_SLOT_AUDIO)) && !mx_nvs_save("audio", &a, sizeof(a))) {
        mx_config_request_save(MX_SLOT_AUDIO);
    }
    if ((dirty & (1U << MX_SLOT_OLED)) && !mx_nvs_save("oled", &o, sizeof(o))) {
        mx_config_request_save(MX_SLOT_OLED);
    }
    if ((dirty & (1U << MX_SLOT_LED)) && !mx_nvs_save("led", &l, sizeof(l))) {
        mx_config_request_save(MX_SLOT_LED);
    }
    if ((dirty & (1U << MX_SLOT_IDLE)) && !mx_nvs_save("idle", &i, sizeof(i))) {
        mx_config_request_save(MX_SLOT_IDLE);
    }
    if ((dirty & (1U << MX_SLOT_FEATURES)) && !mx_nvs_save("feat", &f, sizeof(f))) {
        mx_config_request_save(MX_SLOT_FEATURES);
    }
    if ((dirty & (1U << MX_SLOT_KEYS)) && !mx_nvs_save("keys", &k, sizeof(k))) {
        mx_config_request_save(MX_SLOT_KEYS);
    }
    if ((dirty & (1U << MX_SLOT_MAC)) && !mx_nvs_save("mac", &m, sizeof(m))) {
        mx_config_request_save(MX_SLOT_MAC);
    }
}

void mx_led_set_port_color(uint8_t port, const uint8_t rgb[3]) {
    if (port >= MX_LED_PORTS || !rgb) {
        return;
    }

    portENTER_CRITICAL(&mx_mux);
    led_cfg.auto_player = 0;
    led_cfg.ports[port].r = rgb[0];
    led_cfg.ports[port].g = rgb[1];
    led_cfg.ports[port].b = rgb[2];
    led_generation++;
    portEXIT_CRITICAL(&mx_mux);
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

    if (mx_nvs_load("keys", &k, sizeof(k)) &&
        k.saver_combo < MX_KEYS_COMBO_COUNT && k.menu_combo < MX_KEYS_COMBO_COUNT) {
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
    struct mx_time_cfg time_snap;

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
        time_current(&time_snap);
        src = &time_snap;
        len = sizeof(time_snap);
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

    portENTER_CRITICAL(&mx_mux);
    memcpy(dst, src, len);
    portEXIT_CRITICAL(&mx_mux);
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

        mx_commit(MX_SLOT_AUDIO, &audio_cfg, &tmp, sizeof(tmp));
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

        mx_commit(MX_SLOT_OLED, &oled_cfg, &tmp, sizeof(tmp));
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

        portENTER_CRITICAL(&mx_mux);
        if (memcmp(&tmp, &led_cfg, sizeof(tmp)) != 0) {
            led_generation++;
        }
        led_cfg = tmp;
        portEXIT_CRITICAL(&mx_mux);
        mx_config_request_save(MX_SLOT_LED);
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

        mx_commit(MX_SLOT_IDLE, &idle_cfg, &tmp, sizeof(tmp));
        return 0;
    }

    case MX_SLOT_TIME: {
        struct mx_time_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));
        if (!time_valid(&tmp)) {
            return -1;
        }
        portENTER_CRITICAL(&mx_mux);
        time_cfg = tmp;
        time_set_ms = esp_timer_get_time() / 1000;
        portEXIT_CRITICAL(&mx_mux);
        return 0;
    }

    case MX_SLOT_FEATURES: {
        struct mx_features_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        mx_commit(MX_SLOT_FEATURES, &features_cfg, &tmp, sizeof(tmp));
        return 0;
    }

    case MX_SLOT_KEYS: {
        struct mx_keys_cfg tmp;

        if (len != sizeof(tmp)) {
            return -1;
        }

        memcpy(&tmp, src, sizeof(tmp));

        if (tmp.saver_combo >= MX_KEYS_COMBO_COUNT || tmp.menu_combo >= MX_KEYS_COMBO_COUNT) {
            return -1;
        }

        mx_commit(MX_SLOT_KEYS, &keys_cfg, &tmp, sizeof(tmp));
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

        mx_commit(MX_SLOT_MAC, &mac_cfg, &tmp, sizeof(tmp));
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

/* UI task only: returns a scratch buffer. Other tasks use mx_cfg_time_get(). */
const struct mx_time_cfg *mx_cfg_time(void)
{
    time_current(&time_now);
    return &time_now;
}

void mx_cfg_time_get(struct mx_time_cfg *out)
{
    if (out) {
        time_current(out);
    }
}

void mx_cfg_ui_snapshot(struct mx_audio_cfg *a, struct mx_oled_cfg *o, struct mx_idle_cfg *i)
{
    portENTER_CRITICAL(&mx_mux);
    if (a) {
        *a = audio_cfg;
    }
    if (o) {
        *o = oled_cfg;
    }
    if (i) {
        *i = idle_cfg;
    }
    portEXIT_CRITICAL(&mx_mux);
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
    if (t && time_valid(t)) {
        portENTER_CRITICAL(&mx_mux);
        time_cfg = *t;
        time_set_ms = esp_timer_get_time() / 1000;
        portEXIT_CRITICAL(&mx_mux);
    }
}
