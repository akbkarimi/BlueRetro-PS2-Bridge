/*
 * PS4/PS5 pad shortcuts (Home combos), per the BlueRetro PS2 Bridge specification.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _ADAPTER_SHORTCUT_H_
#define _ADAPTER_SHORTCUT_H_

#include <stdint.h>
#include <stdbool.h>
#include "adapter/adapter.h"

/* Call once per input report with generic wireless input and its wired port.
   Generic button IDs match the WebApp Controller Test/recording bitmask. */
void shortcut_hdl(struct wireless_ctrl *ctrl_data, uint8_t port, int32_t bt_type);

/* Clear the shortcut state of one wired port (device disconnected). */
void shortcut_reset(uint8_t index);

#endif /* _ADAPTER_SHORTCUT_H_ */
