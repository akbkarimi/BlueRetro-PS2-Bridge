/*
 * Per-controller shortcut engine for PlayStation-compatible pads.
 * Fixed system shortcuts coexist with versioned, user-configurable OLED
 * actions stored in the MX KEYS slot. Configurable combos are evaluated
 * against generic HID input so WebApp recording and firmware use the same
 * button bit positions, independent of the selected wired output mapping.
 * SPDX-License-Identifier: Apache-2.0
 */

#include <string.h>
#include "sdkconfig.h"

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "zephyr/types.h"
#include "tools/util.h"
#include "system/manager.h"
#include "system/ui.h"
#include "system/mx_config.h"
#include "bluetooth/host.h"
#include "adapter/adapter.h"
#include "adapter/shortcut.h"

#if defined(CONFIG_BLUERETRO_SYSTEM_PSX_PS2) || defined(CONFIG_BLUERETRO_SYSTEM_UNIVERSAL)

#define HOME_HOLD_POWER_OFF_MS  3000    /* Spec: hold Home 3 s = power off */
#define HOME_MAX_TAP_MS         400     /* Press shorter than this counts as a tap */
#define HOME_DOUBLE_GAP_MS      600     /* Two taps this close = console reset */

struct shortcut_action_state {
    uint32_t started;
    uint32_t last_press;
    uint8_t fired;
};

struct shortcut_state {
    uint32_t btns_prev;
    uint32_t home_t0;
    uint32_t home_last_release;
    uint8_t home_down;
    uint8_t home_fired_hold;
    uint8_t home_short_tap;
    uint8_t home_combo_used;
    uint8_t keys_valid;
    struct mx_keys_cfg keys_snapshot;
    struct shortcut_action_state action[MX_KEYS_ACTION_MAX];
};

static struct shortcut_state st[WIRED_MAX_DEV];

static uint32_t tick_ms(void) {
    return (uint32_t)xTaskGetTickCount() * portTICK_PERIOD_MS;
}

static void shortcut_action_dispatch(uint8_t action, uint8_t port) {
    switch (action) {
    case MX_SC_SAVER_ENTER: ui_event(UI_EVT_SAVER_ENTER); break;
    case MX_SC_MENU_ENTER: ui_event(UI_EVT_MENU_ENTER); break;
    case MX_SC_PAGE_NEXT: ui_event(UI_EVT_PAGE_NEXT); break;
    case MX_SC_PAGE_PREV: ui_event(UI_EVT_PAGE_PREV); break;
    case MX_SC_SAVER_NEXT: ui_event(UI_EVT_SAVER_NEXT); break;
    case MX_SC_SAVER_PREV: ui_event(UI_EVT_SAVER_PREV); break;
    case MX_SC_DISCONNECT_PAD:
        printf("# SHORTCUT: disconnect controller on port %u\\n", (unsigned)(port + 1));
        bt_host_disconnect_out_idx(port);
        break;
    case MX_SC_DISCONNECT_ALL:
        printf("# SHORTCUT: disconnect all Bluetooth controllers\\n");
        bt_host_disconnect_all();
        break;
    default: break;
    }
}

static void shortcut_actions_hdl(struct shortcut_state *s, uint32_t btns,
                                 uint32_t prev, uint32_t now, uint8_t port,
                                 const struct mx_keys_cfg *keys) {
    if (!keys || keys->version != MX_KEYS_VERSION || keys->count > MX_KEYS_ACTION_MAX) {
        memset(s->action, 0, sizeof(s->action));
        s->keys_valid = 0;
        return;
    }
    if (!s->keys_valid || memcmp(&s->keys_snapshot, keys, sizeof(*keys)) != 0) {
        memset(s->action, 0, sizeof(s->action));
        memcpy(&s->keys_snapshot, keys, sizeof(*keys));
        s->keys_valid = 1;
    }

    for (uint8_t i = 0; i < keys->count; i++) {
        const struct mx_shortcut_entry *e = &keys->entries[i];
        struct shortcut_action_state *a = &s->action[i];
        bool active, was, fire = false;
        if (!e->enabled || !e->buttons) { a->started = 0; a->fired = 0; continue; }
        active = (btns & e->buttons) == e->buttons;
        was = (prev & e->buttons) == e->buttons;
        if (active && !was) { a->started = now; a->fired = 0; }
        switch (e->trigger) {
        case MX_SC_TRIGGER_PRESS:
            fire = active && !was;
            break;
        case MX_SC_TRIGGER_HOLD:
            if (active && !a->fired && (uint32_t)(now - a->started) >= e->hold_ms) {
                fire = true; a->fired = 1;
            }
            break;
        case MX_SC_TRIGGER_RELEASE:
            fire = !active && was;
            break;
        case MX_SC_TRIGGER_DOUBLE:
            if (active && !was) {
                if (a->last_press && (uint32_t)(now - a->last_press) <= 500) {
                    fire = true; a->last_press = 0;
                } else a->last_press = now;
            }
            break;
        default: break;
        }
        if (fire) shortcut_action_dispatch(e->action, port);
        if (!active && was) { a->started = 0; a->fired = 0; }
    }
}

void shortcut_reset(uint8_t index) {
    if (index < WIRED_MAX_DEV) {
        memset(&st[index], 0, sizeof(st[index]));
    }
}

void shortcut_hdl(struct wireless_ctrl *ctrl_data, uint8_t port, int32_t bt_type) {
    struct shortcut_state *s;
    const struct mx_keys_cfg *keys;
    uint32_t now, btns, prev;
    bool home, start, share;

    if (ctrl_data == NULL || port >= WIRED_MAX_DEV) {
        return;
    }

    /* Pads only: keyboards/mice share the generic btns[0] bits with PAD_MM etc. */
    switch (bt_type) {
        case BT_PS3:
        case BT_WII:
        case BT_PS:
        case BT_SW:
        case BT_SW2:
            break;
        default:
            return;
    }

    s = &st[port];
    now = tick_ms();
    btns = ctrl_data->btns[0].value;
    prev = s->btns_prev;

    home = !!(btns & BIT(PAD_MM));
    start = !!(btns & BIT(PAD_MT));
    share = !!(btns & BIT(PAD_MS));

    /* --- Home press/release edges --- */
    if (home && !s->home_down) {
        s->home_down = 1;
        s->home_fired_hold = 0;
        s->home_combo_used = 0;
        s->home_t0 = now;
    }
    else if (!home && s->home_down) {
        uint32_t held = now - s->home_t0;

        s->home_down = 0;
        if (held < HOME_MAX_TAP_MS && !s->home_combo_used) {
            if (s->home_short_tap && (now - s->home_last_release) < HOME_DOUBLE_GAP_MS) {
                /* Double tap Home: console reset */
                printf("# SHORTCUT: Home double tap -> console reset\n");
                sys_mgr_cmd(SYS_MGR_CMD_RST);
                s->home_short_tap = 0;
                s->home_last_release = 0;
            }
            else {
                s->home_short_tap = 1;
                s->home_last_release = now;
            }
        }
        else {
            s->home_short_tap = 0;
        }
        s->home_combo_used = 0;
    }

    if (home && (btns & ~BIT(PAD_MM))) {
        s->home_combo_used = 1;
        s->home_fired_hold = 1; /* Any Home combo cancels the standalone 3 s power-off. */
        s->home_short_tap = 0;
    }

    /* --- Hold Home 3 s: power off only when Home is the sole pressed button. --- */
    if (s->home_down && !s->home_fired_hold && !(btns & ~BIT(PAD_MM)) &&
        (now - s->home_t0) >= HOME_HOLD_POWER_OFF_MS) {
        printf("# SHORTCUT: Home held 3 s -> power off\n");
        s->home_fired_hold = 1;
        s->home_short_tap = 0;
        sys_mgr_cmd(SYS_MGR_CMD_PWR_OFF);
    }

    /* --- Home + Start: pairing toggle (fixed) --- */
    if (home && start && !(prev & BIT(PAD_MT))) {
        printf("# SHORTCUT: Home+Start -> BT inquiry toggle\n");
        s->home_t0 = now;
        s->home_fired_hold = 1;
        s->home_short_tap = 0;
        s->home_combo_used = 1;
        sys_mgr_cmd(SYS_MGR_CMD_INQ_TOOGLE);
    }

    /* --- Home + Share: disconnect this pad (fixed) --- */
    if (home && share && !(prev & BIT(PAD_MS))) {
        printf("# SHORTCUT: Home+Share -> disconnect pad\n");
        s->home_t0 = now;
        s->home_fired_hold = 1;
        s->home_short_tap = 0;
        s->home_combo_used = 1;
        bt_host_disconnect_out_idx(port);
    }

    /* --- Versioned Shortcut Manager actions (MX KEYS slot) --- */
    keys = mx_cfg_keys();
    shortcut_actions_hdl(s, btns, prev, now, port, keys);

    s->btns_prev = btns;
}

#else /* Not a PS1/PS2 build */

void shortcut_reset(uint8_t index) { (void)index; }
void shortcut_hdl(struct wireless_ctrl *ctrl_data, uint8_t port, int32_t bt_type) {
    (void)ctrl_data;
    (void)port;
    (void)bt_type;
}

#endif
