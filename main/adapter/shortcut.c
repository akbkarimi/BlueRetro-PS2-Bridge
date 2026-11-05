/*
 * PS4/PS5 (and friends) pad shortcuts, per the MethyleneX spec workbook:
 *
 *   Hold Home for 3 seconds     -> power off the console
 *   Double press Home           -> reset the console
 *   Home + Start (Options)      -> toggle BT pairing (inquiry)
 *   Home + Share                -> disconnect this pad
 *
 * Two OLED functions are CONFIGURABLE from the WebApp Shortcuts page
 * (MX KEYS slot, NVS): which combo puts the OLED in screensaver mode and
 * which combo returns to the main menu. Defaults:
 *   Home + D-Pad right -> screensaver mode
 *   Home + D-Pad left  -> main menu
 *
 * The touchpad covers swipe navigation via ui_touch_feed()
 * (swipe left/right = info pages, up/down = lightbar color).
 * Runs in the Bluetooth RX task for every pad input report (adapter_bridge),
 * so it only keeps a few state variables per wired port.
 *
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

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

#ifdef CONFIG_BLUERETRO_SYSTEM_PSX_PS2

#define HOME_HOLD_POWER_OFF_MS  3000    /* Spec: hold Home 3 s = power off */
#define HOME_MAX_TAP_MS         400     /* Press shorter than this counts as a tap */
#define HOME_DOUBLE_GAP_MS      600     /* Two taps this close = console reset */
#define COMBO_RETRY_SKIP_MS     500     /* Min delay between two combo triggers */

struct shortcut_state {
    uint32_t btns_prev;
    uint32_t home_t0;               /* Tick when Home went down */
    uint32_t home_last_release;
    uint32_t combo_last;            /* Tick of the last configurable combo trigger */
    uint8_t  home_down;
    uint8_t  home_fired_hold;       /* 3 s hold already triggered */
    uint8_t  home_short_tap;        /* Last press was a short tap */
};

static struct shortcut_state st[WIRED_MAX_DEV];

static uint32_t tick_ms(void) {
    return (uint32_t)xTaskGetTickCount() * portTICK_PERIOD_MS;
}

static bool combo_ready(const struct shortcut_state *s, uint32_t now) {
    return (now - s->home_t0) >= COMBO_RETRY_SKIP_MS;
}

/* Both combo buttons pressed now, and at least one of them went down
   since the previous report (edge trigger, no auto-repeat). */
static bool combo_pressed(uint32_t btns, uint32_t prev, uint32_t mask) {
    return (btns & mask) == mask && (btns & mask & ~prev);
}

/* Is the given configurable combo active on this report? */
static bool keys_combo_hit(const struct shortcut_state *s, uint32_t btns,
                           uint32_t prev, uint32_t now, uint8_t combo, uint32_t skip_ms) {
    bool hit = false;

    switch (combo) {
        case MX_KEYS_COMBO_HOME_UP:
            hit = combo_pressed(btns, prev, BIT(PAD_MM) | BIT(PAD_LD_UP));
            break;
        case MX_KEYS_COMBO_HOME_DOWN:
            hit = combo_pressed(btns, prev, BIT(PAD_MM) | BIT(PAD_LD_DOWN));
            break;
        case MX_KEYS_COMBO_HOME_LEFT:
            hit = combo_pressed(btns, prev, BIT(PAD_MM) | BIT(PAD_LD_LEFT));
            break;
        case MX_KEYS_COMBO_HOME_RIGHT:
            hit = combo_pressed(btns, prev, BIT(PAD_MM) | BIT(PAD_LD_RIGHT));
            break;
        case MX_KEYS_COMBO_SHARE_CROSS:
            hit = combo_pressed(btns, prev, BIT(PAD_MS) | BIT(PAD_RB_DOWN));
            break;
        case MX_KEYS_COMBO_L1_R1:
            hit = combo_pressed(btns, prev, BIT(PAD_LS) | BIT(PAD_RS));
            break;
        case MX_KEYS_COMBO_L2_R2:
            hit = combo_pressed(btns, prev, BIT(PAD_LT) | BIT(PAD_RT));
            break;
        case MX_KEYS_COMBO_L3_R3:
            hit = combo_pressed(btns, prev, BIT(PAD_LJ) | BIT(PAD_RJ));
            break;
        default:
            break;
    }

    return hit && (now - s->combo_last) >= skip_ms;
}

void shortcut_reset(uint8_t index) {
    if (index < WIRED_MAX_DEV) {
        memset(&st[index], 0, sizeof(st[index]));
    }
}

void shortcut_hdl(struct wired_ctrl *ctrl_data, int32_t bt_type) {
    struct shortcut_state *s;
    const struct mx_keys_cfg *keys;
    uint32_t now, btns, prev;
    bool home, start, share, dpad_any;

    if (ctrl_data == NULL || ctrl_data->index >= WIRED_MAX_DEV) {
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

    s = &st[ctrl_data->index];
    now = tick_ms();
    btns = ctrl_data->btns[0].value;
    prev = s->btns_prev;

    home = !!(btns & BIT(PAD_MM));
    start = !!(btns & BIT(PAD_MT));
    share = !!(btns & BIT(PAD_MS));
    dpad_any = !!(btns & (BIT(PAD_LD_UP) | BIT(PAD_LD_DOWN) | BIT(PAD_LD_LEFT) | BIT(PAD_LD_RIGHT)));

    /* --- Home press/release edges --- */
    if (home && !s->home_down) {
        s->home_down = 1;
        s->home_fired_hold = 0;
        s->home_t0 = now;
    }
    else if (!home && s->home_down) {
        uint32_t held = now - s->home_t0;

        s->home_down = 0;
        if (held < HOME_MAX_TAP_MS) {
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
    }

    /* --- Hold Home 3 s: power off (only while no combo button is used) --- */
    if (s->home_down && !s->home_fired_hold && !start && !share && !dpad_any &&
        (now - s->home_t0) >= HOME_HOLD_POWER_OFF_MS) {
        printf("# SHORTCUT: Home held 3 s -> power off\n");
        s->home_fired_hold = 1;
        s->home_short_tap = 0;
        sys_mgr_cmd(SYS_MGR_CMD_PWR_OFF);
    }

    /* --- Home + Start: pairing toggle (fixed) --- */
    if (home && start && !(prev & BIT(PAD_MT)) && combo_ready(s, now)) {
        printf("# SHORTCUT: Home+Start -> BT inquiry toggle\n");
        s->home_t0 = now;   /* Block repeats + keep the 3 s hold from firing */
        s->home_fired_hold = 1;
        sys_mgr_cmd(SYS_MGR_CMD_INQ_TOOGLE);
    }

    /* --- Home + Share: disconnect this pad (fixed) --- */
    if (home && share && !(prev & BIT(PAD_MS)) && combo_ready(s, now)) {
        struct bt_dev *device = NULL;

        printf("# SHORTCUT: Home+Share -> disconnect pad\n");
        s->home_t0 = now;
        s->home_fired_hold = 1;
        if (bt_host_get_active_dev_from_out_idx(ctrl_data->index, &device) == 0 && device) {
            bt_host_reset_dev(device);
        }
    }

    /* --- Configurable OLED combos (MX KEYS slot) --- */
    keys = mx_cfg_keys();
    if (keys) {
        /* Home based combos keep the 3 s power off from firing while held */
        uint8_t saver_is_home = keys->saver_combo <= MX_KEYS_COMBO_HOME_RIGHT;
        uint8_t menu_is_home = keys->menu_combo <= MX_KEYS_COMBO_HOME_RIGHT;

        if (keys_combo_hit(s, btns, prev, now, keys->saver_combo, COMBO_RETRY_SKIP_MS)) {
            printf("# SHORTCUT: combo %u -> screensaver mode\n", keys->saver_combo);
            s->combo_last = now;
            if (saver_is_home) {
                s->home_t0 = now;
                s->home_fired_hold = 1;
            }
            ui_event(UI_EVT_SAVER_ENTER);
        }
        else if (keys_combo_hit(s, btns, prev, now, keys->menu_combo, COMBO_RETRY_SKIP_MS)) {
            printf("# SHORTCUT: combo %u -> main menu\n", keys->menu_combo);
            s->combo_last = now;
            if (menu_is_home) {
                s->home_t0 = now;
                s->home_fired_hold = 1;
            }
            ui_event(UI_EVT_MENU_ENTER);
        }
    }

    s->btns_prev = btns;
}

#else /* Not a PS1/PS2 build */

void shortcut_reset(uint8_t index) { (void)index; }
void shortcut_hdl(struct wired_ctrl *ctrl_data, int32_t bt_type) {
    (void)ctrl_data;
    (void)bt_type;
}

#endif
