/*
 * Copyright (c) 2019-2023, Jacques Gagnon
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _SYS_MANAGER_H_
#define _SYS_MANAGER_H_ 

#include <stdint.h>

enum {
    SYS_MGR_CMD_RST = 0,
    SYS_MGR_CMD_PWR_ON,
    SYS_MGR_CMD_PWR_OFF,
    SYS_MGR_CMD_INQ_TOOGLE,
    SYS_MGR_CMD_FACTORY_RST,
    SYS_MGR_CMD_DEEP_SLEEP,
    SYS_MGR_CMD_ADAPTER_RST,
    SYS_MGR_CMD_WIRED_RST,
};

void sys_mgr_cmd(uint8_t cmd);
void sys_mgr_init(uint32_t package);

/* Queue a PLAYER_LED feedback for every connected pad so it re-reads
   ps_ctrl_color_get() and shows the current lightbar color. Safe to call
   from any task (best effort, drops on a full queue). */
void manager_send_pad_colors(void);

#endif /* _SYS_MANAGER_H_ */
