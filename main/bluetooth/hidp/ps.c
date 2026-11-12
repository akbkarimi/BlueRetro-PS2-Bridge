/*
 * Copyright (c) 2019-2024, Jacques Gagnon
 * SPDX-License-Identifier: Apache-2.0
 */

#include <stdio.h>
#include <esp32/rom/crc.h>
#include <esp_timer.h>
#include "adapter/adapter.h"
#include "adapter/config.h"
#include "bluetooth/host.h"
#include "system/ui.h"
#include "ps.h"

static void bt_hid_cmd_ps5_set_conf(struct bt_dev *device, void *report);
static void bt_hid_cmd_ps4_set_conf(struct bt_dev *device, void *report);

/* ---------------- Lightbar connect flash (red -> orange -> color) ----------------
 *
 * At pad init we start a short esp_timer that re-sends the lightbar color while
 * the UI flash is active, then sends the final color once and stops. Sending HID
 * from the esp_timer context mirrors what the DS4 init timer already does.
 */

#define PS_FLASH_PERIOD_US  (150 * 1000)
#define PS_FLASH_MAX_IDX    8

struct ps_flash {
    esp_timer_handle_t hdl;
    struct bt_dev *device;
};

static struct ps_flash ps_flashes[PS_FLASH_MAX_IDX];

static void bt_hid_ps_flash_send(struct bt_dev *device, uint32_t rgb) {
    if (device->ids.subtype == BT_PS5_DS) {
        struct bt_hidp_ps5_set_conf conf = {
            .conf0 = 0x02,
            .cmd = 0x03,
            .conf1 = 0x04,
        };

        conf.leds = rgb;
        bt_hid_cmd_ps5_set_conf(device, (void *)&conf);
    }
    else {
        struct bt_hidp_ps4_set_conf conf = {
            .conf0 = 0xc4,
            .conf1 = 0x03,
        };

        conf.leds = rgb;
        bt_hid_cmd_ps4_set_conf(device, (void *)&conf);
    }
}

static void bt_hid_ps_flash_tick(void *arg) {
    struct ps_flash *f = (struct ps_flash *)arg;
    struct bt_dev *device = f->device;
    uint32_t rgb = 0;

    if (device == NULL) {
        return;
    }

    if (ui_color_flash_get(device->ids.out_idx, &rgb)) {
        /* Apply configured brightness to temporary connect-flash colors too. */
        bt_hid_ps_flash_send(device, ps_ctrl_color_get(device->ids.out_idx));
    }
    else {
        /* Flash over: restore the configured color and stop */
        bt_hid_ps_flash_send(device, ps_ctrl_color_get(device->ids.out_idx));
        if (f->hdl) {
            esp_timer_stop(f->hdl);
            esp_timer_delete(f->hdl);
            f->hdl = NULL;
        }
        f->device = NULL;
    }
}

static void bt_hid_ps_flash_start(struct bt_dev *device) {
    int32_t idx = device->ids.out_idx;

    if (idx < 0 || idx >= PS_FLASH_MAX_IDX) {
        return;
    }

    struct ps_flash *f = &ps_flashes[idx];
    const esp_timer_create_args_t args = {
        .callback = &bt_hid_ps_flash_tick,
        .arg = (void *)f,
        .name = "ps_flash",
    };

    if (f->hdl) {
        esp_timer_stop(f->hdl);
        esp_timer_delete(f->hdl);
        f->hdl = NULL;
    }

    ui_color_flash_start((uint8_t)idx);

    if (esp_timer_create(&args, &f->hdl) == ESP_OK) {
        f->device = device;
        esp_timer_start_periodic(f->hdl, PS_FLASH_PERIOD_US);
    }
    else {
        f->hdl = NULL;
        f->device = NULL;
        ui_color_flash_stop((uint8_t)idx);
    }
}

static void bt_hid_cmd_ps4_set_conf(struct bt_dev *device, void *report) {
    struct bt_hidp_ps4_set_conf *set_conf = (struct bt_hidp_ps4_set_conf *)bt_hci_pkt_tmp.hidp_data;

    bt_hci_pkt_tmp.hidp_hdr.hdr = BT_HIDP_DATA_OUT;
    bt_hci_pkt_tmp.hidp_hdr.protocol = BT_HIDP_PS4_SET_CONF;

    memcpy((void *)set_conf, report, sizeof(*set_conf));

    set_conf->crc = crc32_le((uint32_t)~0xFFFFFFFF, (void *)&bt_hci_pkt_tmp.hidp_hdr,
        sizeof(bt_hci_pkt_tmp.hidp_hdr) + sizeof(*set_conf) - sizeof(set_conf->crc));

    bt_hid_cmd(device->acl_handle, device->intr_chan.dcid, BT_HIDP_DATA_OUT, BT_HIDP_PS4_SET_CONF, sizeof(*set_conf));
}

static void bt_hid_cmd_ps5_trigger_init(struct bt_dev *device) {
    int32_t perc_threshold_l = -1;
    int32_t perc_threshold_r = -1;
    int32_t dev = device->ids.id;
    uint32_t map_cnt_l = 0;
    uint32_t map_cnt_r = 0;

    if (wired_adapter.system_id == WIRED_AUTO) {
        /* Can't configure feature if target system is unknown */
        return;
    }

    printf("# %s\n", __FUNCTION__);

    /* Make sure meta desc is init */
    adapter_meta_init();

    /* Go through the list of mappings, looking for PAD_RM and PAD_LM */
    for (uint32_t i = 0; i < config.in_cfg[dev].map_size; i++) {
        if (config.in_cfg[dev].map_cfg[i].dst_btn < BR_COMBO_BASE_1) {
            uint8_t is_axis = btn_is_axis(config.in_cfg[dev].map_cfg[i].dst_id, config.in_cfg[dev].map_cfg[i].dst_btn);
            if (config.in_cfg[dev].map_cfg[i].src_btn == PAD_RM) {
                map_cnt_r++;
                if (is_axis) {
                    continue;
                }
                if (config.in_cfg[dev].map_cfg[i].perc_threshold > perc_threshold_r) {
                    perc_threshold_r = config.in_cfg[dev].map_cfg[i].perc_threshold;
                }
            }
            else if (config.in_cfg[dev].map_cfg[i].src_btn == PAD_LM) {
                map_cnt_l++;
                if (is_axis) {
                    continue;
                }
                if (config.in_cfg[dev].map_cfg[i].perc_threshold > perc_threshold_l) {
                    perc_threshold_l = config.in_cfg[dev].map_cfg[i].perc_threshold;
                }
            }
        }
    }
    /* If only one mapping exist do not set resistance */
    if (map_cnt_r < 2) {
        perc_threshold_r = -1;
    }
    if (map_cnt_l < 2) {
        perc_threshold_l = -1;
    }

    uint8_t r2_start_resistance_value = (perc_threshold_r * 255) / 100;
    uint8_t l2_start_resistance_value = (perc_threshold_l * 255) / 100;

    uint8_t r2_trigger_start_resistance = (uint8_t)(0x94 * (r2_start_resistance_value / 255.0));
    uint8_t r2_trigger_effect_force =
        (uint8_t)((0xb4 - r2_trigger_start_resistance) * (r2_start_resistance_value / 255.0) + r2_trigger_start_resistance);

    uint8_t l2_trigger_start_resistance = (uint8_t)(0x94 * (l2_start_resistance_value / 255.0));
    uint8_t l2_trigger_effect_force =
        (uint8_t)((0xb4 - l2_trigger_start_resistance) * (l2_start_resistance_value / 255.0) + l2_trigger_start_resistance);

    struct bt_hidp_ps5_set_conf ps5_set_conf = {
        .conf0 = 0x02,
        .cmd = 0x0c,
        .r2_trigger_motor_mode = perc_threshold_r > -1 ? 0x02 : 0x00,
        .r2_trigger_start_resistance = r2_trigger_start_resistance,
        .r2_trigger_effect_force = r2_trigger_effect_force,
        .r2_trigger_range_force = 0xff,
        .r2_trigger_near_release_str = 0x00,
        .r2_trigger_near_middle_str = 0x00,
        .r2_trigger_pressed_str = 0x00,
        .r2_trigger_actuation_freq = 0x00,
        .l2_trigger_motor_mode = perc_threshold_l > -1 ? 0x02 : 0x00,
        .l2_trigger_start_resistance = l2_trigger_start_resistance,
        .l2_trigger_effect_force = l2_trigger_effect_force,
        .l2_trigger_range_force = 0xff,
        .l2_trigger_near_release_str = 0x00,
        .l2_trigger_near_middle_str = 0x00,
        .l2_trigger_pressed_str = 0x00,
        .l2_trigger_actuation_freq = 0x00,
    };

    bt_hid_cmd_ps5_set_conf(device, (void *)&ps5_set_conf);
}

static void bt_hid_ps5_init_callback(void *arg) {
    struct bt_dev *device = (struct bt_dev *)arg;

    if (device->ids.report_type != BT_HIDP_PS4_STATUS) {
        struct bt_data *bt_data = &bt_adapter.data[device->ids.id];
        struct bt_hidp_ps5_set_conf *set_conf = (struct bt_hidp_ps5_set_conf *)bt_data->base.output;

        /* Init output data for Rumble/LED feedback */
        memset(set_conf, 0x00, sizeof(*set_conf));
        set_conf->conf0 = 0x02;
        set_conf->cmd = 0x03;
        set_conf->conf1 = 0x04;
        set_conf->leds = ps_ctrl_color_get(device->ids.out_idx);

        struct bt_hidp_ps5_set_conf ps5_clear_led = {
            .conf0 = 0x02,
            .conf1 = 0x08,
        };
        struct bt_hidp_ps5_set_conf ps5_set_led = {
            .conf0 = 0x02,
            .conf1 = 0x04,
        };
        ps5_set_led.leds = ps_ctrl_color_get(device->ids.out_idx);
        printf("# %s\n", __FUNCTION__);

        bt_hid_cmd_ps5_set_conf(device, (void *)&ps5_clear_led);
        bt_hid_cmd_ps5_set_conf(device, (void *)&ps5_set_led);

        /* Set trigger "click" haptic effect when rumble is on */
        if (config.out_cfg[device->ids.out_idx].acc_mode == ACC_RUMBLE
                || config.out_cfg[device->ids.out_idx].acc_mode == ACC_BOTH) {
            bt_hid_cmd_ps5_trigger_init(device);
        }
    }

    esp_timer_delete(device->timer_hdl);
    device->timer_hdl = NULL;

    atomic_set_bit(&device->flags, BT_DEV_HID_INIT_DONE);
    printf("# PS init done\n");
}

static void bt_hid_cmd_ps5_set_conf(struct bt_dev *device, void *report) {
    struct bt_hidp_ps5_set_conf *set_conf = (struct bt_hidp_ps5_set_conf *)bt_hci_pkt_tmp.hidp_data;

    bt_hci_pkt_tmp.hidp_hdr.hdr = BT_HIDP_DATA_OUT;
    bt_hci_pkt_tmp.hidp_hdr.protocol = BT_HIDP_PS5_SET_CONF;

    memcpy((void *)set_conf, report, sizeof(*set_conf));

    set_conf->crc = crc32_le((uint32_t)~0xFFFFFFFF, (void *)&bt_hci_pkt_tmp.hidp_hdr,
        sizeof(bt_hci_pkt_tmp.hidp_hdr) + sizeof(*set_conf) - sizeof(set_conf->crc));

    bt_hid_cmd(device->acl_handle, device->intr_chan.dcid, BT_HIDP_DATA_OUT, BT_HIDP_PS5_SET_CONF, sizeof(*set_conf));
}

void bt_hid_cmd_ps_set_conf(struct bt_dev *device, void *report) {
    switch (device->ids.subtype) {
        case BT_PS5_DS:
            bt_hid_cmd_ps5_set_conf(device, report);
            break;
        default:
            bt_hid_cmd_ps4_set_conf(device, report);
            break;
    }
}

void bt_hid_ps_init(struct bt_dev *device) {
#ifndef CONFIG_BLUERETRO_TEST_FALLBACK_REPORT
    struct bt_data *bt_data = &bt_adapter.data[device->ids.id];
    struct bt_hidp_ps4_set_conf *set_conf = (struct bt_hidp_ps4_set_conf *)bt_data->base.output;

    /* Init output data for Rumble/LED feedback */
    set_conf->conf0 = 0xc4;
    set_conf->conf1 = 0x03;
    set_conf->leds = ps_ctrl_color_get(bt_data->base.pids->out_idx);

    /* Start the lightbar connect flash (red -> orange -> configured color) */
    bt_hid_ps_flash_start(device);

    switch (device->ids.subtype) {
        case BT_PS5_DS:
            bt_hid_ps5_init_callback((void *)device);
            break;
        default:
        {
            const esp_timer_create_args_t ps5_timer_args = {
                .callback = &bt_hid_ps5_init_callback,
                .arg = (void *)device,
                .name = "ps5_init_timer"
            };
            struct bt_hidp_ps4_set_conf ps4_set_conf = {
                .conf0 = 0xc0,
                .conf1 = 0x07,
            };
            ps4_set_conf.leds = ps_ctrl_color_get(device->ids.out_idx);

            printf("# %s\n", __FUNCTION__);

            esp_timer_create(&ps5_timer_args, (esp_timer_handle_t *)&device->timer_hdl);
            esp_timer_start_once(device->timer_hdl, 1000000);
            bt_hid_cmd_ps4_set_conf(device, (void *)&ps4_set_conf);
            break;
        }
    }
#endif
}

void bt_hid_ps_hdlr(struct bt_dev *device, struct bt_hci_pkt *bt_hci_acl_pkt, uint32_t len) {
    uint32_t hidp_data_len = len - (BT_HCI_H4_HDR_SIZE + BT_HCI_ACL_HDR_SIZE
                                    + sizeof(struct bt_l2cap_hdr) + sizeof(struct bt_hidp_hdr));

    switch (bt_hci_acl_pkt->sig_hdr.code) {
        case BT_HIDP_DATA_IN:
            switch (bt_hci_acl_pkt->hidp_hdr.protocol) {
                case BT_HIDP_HID_STATUS:
                    if (device->ids.report_type != BT_HIDP_HID_STATUS) {
                        bt_type_update(device->ids.id, BT_PS, BT_SUBTYPE_DEFAULT);
                        device->ids.report_type = BT_HIDP_HID_STATUS;
                    }
                    bt_host_bridge(device, bt_hci_acl_pkt->hidp_hdr.protocol, bt_hci_acl_pkt->hidp_data, hidp_data_len);
                    break;
                case BT_HIDP_PS4_STATUS:
                    if (device->ids.report_type != BT_HIDP_PS4_STATUS) {
                        bt_type_update(device->ids.id, BT_PS, BT_SUBTYPE_DEFAULT);
                        device->ids.report_type = BT_HIDP_PS4_STATUS;
                    }
                    /*
                     * DS4 Bluetooth report 0x11 carries its report ID in the
                     * HIDP header. The two reserved bytes remain in hidp_data,
                     * so Linux's report byte 32 maps to hidp_data[31].
                     * Bits 0..3 encode battery capacity; bit 4 is cable state.
                     */
                    if (hidp_data_len > 31) {
                        uint8_t status = bt_hci_acl_pkt->hidp_data[31];
                        uint8_t level = status & 0x0F;
                        uint8_t battery_pct = UI_BATTERY_PERCENT_NA;
                        uint8_t battery_state = UI_BATTERY_UNKNOWN;

                        if (status & (1u << 4)) {
                            /* On cable: levels 0..10 are 0..100%; 11 is full. */
                            if (level <= 10) {
                                battery_pct = (uint8_t)(level * 10);
                                battery_state = UI_BATTERY_CHARGING;
                            }
                            else if (level == 11) {
                                battery_pct = 100;
                                battery_state = UI_BATTERY_FULL;
                            }
                        }
                        else if (level <= 9) {
                            /* On battery, DS4 reports 0..9 for 10..100%. */
                            battery_pct = (uint8_t)((level + 1) * 10);
                            battery_state = UI_BATTERY_DISCHARGING;
                        }
                        /* Reserved/invalid levels stay Unknown (never fake 100%). */

                        ui_battery_set((uint8_t)device->ids.out_idx,
                            battery_pct, battery_state);
                    }
#ifdef CONFIG_BLUERETRO_ADAPTER_RUMBLE_TEST
                    struct bt_hidp_ps4_set_conf rumble4 = {
                        .conf0 = 0xc4,
                        .conf1 = 0x03,
                    };
                    rumble4.r_rumble = bt_hci_acl_pkt->hidp_data[10];
                    rumble4.l_rumble = bt_hci_acl_pkt->hidp_data[9];
                    bt_hid_cmd_ps4_set_conf(device, &rumble4);
#else
                    bt_host_bridge(device, bt_hci_acl_pkt->hidp_hdr.protocol, bt_hci_acl_pkt->hidp_data, hidp_data_len);
#endif
                    break;
                case BT_HIDP_PS5_STATUS:
                    if (device->ids.report_type != BT_HIDP_PS5_STATUS) {
                        bt_type_update(device->ids.id, BT_PS, BT_PS5_DS);
                        device->ids.report_type = BT_HIDP_PS5_STATUS;
                    }
#ifdef CONFIG_BLUERETRO_ADAPTER_RUMBLE_TEST
                    struct bt_hidp_ps5_set_conf rumble = {
                        .conf0 = 0x02,
                        .cmd = 0x03,
                    };
                    rumble.r_rumble = bt_hci_acl_pkt->hidp_data[6];
                    rumble.l_rumble = bt_hci_acl_pkt->hidp_data[5];
                    bt_hid_cmd_ps5_set_conf(device, &rumble);
#else
                    bt_host_bridge(device, bt_hci_acl_pkt->hidp_hdr.protocol, bt_hci_acl_pkt->hidp_data, hidp_data_len);
#endif
                    break;
            }
            break;
    }
}
