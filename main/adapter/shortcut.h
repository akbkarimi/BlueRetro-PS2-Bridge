/*
 * PS4/PS5 pad shortcuts (Home combos), per the MethyleneX spec workbook.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _ADAPTER_SHORTCUT_H_
#define _ADAPTER_SHORTCUT_H_

#include <stdint.h>
#include <stdbool.h>
#include "adapter/adapter.h"

/* Call once per input report, after sys_macro_hdl(), with the mapped output
   of one pad. bt_type = bt_data->base.pids->type (BT_PS, BT_SW, ...). */
void shortcut_hdl(struct wired_ctrl *ctrl_data, int32_t bt_type);

/* Clear the shortcut state of one wired port (device disconnected). */
void shortcut_reset(uint8_t index);

#endif /* _ADAPTER_SHORTCUT_H_ */
