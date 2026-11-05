/*
 * OLED screensavers (per the MethyleneX spec workbook).
 * Draws into the ui_gfx framebuffer, no hardware access.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _UI_SAVER_H_
#define _UI_SAVER_H_

#include <stdint.h>

/*
 * The order matches the MX idle modes: MX_IDLE_CUBE = 1 -> SAVER_CUBE = 0, etc.
 * (mx_config.h). SAVER_PAD is a fork extra, reachable only through the
 * auto-cycle and the touchpad swipes.
 */
typedef enum {
    SAVER_CUBE = 0,     /* Rotating wireframe diamond (idle_cube) */
    SAVER_STARS,        /* Scrolling starfield */
    SAVER_TETRIS,       /* Tetris playing itself */
    SAVER_SYMBOLS,      /* Bouncing cross, circle, triangle, square */
    SAVER_BALLS,        /* Bouncing square balls */
    SAVER_PONG,         /* Pong demo */
    SAVER_CLOCK_ANALOG, /* Analog clock from the MX time slot */
    SAVER_CLOCK_FLIP,   /* Flip clock (two boxes, HH MM) */
    SAVER_CLOCK_RECT,   /* Rectangular clock (HH:MM / DD-MM) */
    SAVER_LOGO_PS,      /* "Logo PS" bitmap from the spec workbook */
    SAVER_LOGO_PLAYSTATION, /* "Logo playstation" bitmap */
    SAVER_PAD,          /* Bouncing PlayStation style controller (extra) */
    SAVER_COUNT,
} saver_id_t;

void saver_seed(uint32_t seed);
void saver_start(saver_id_t id);            /* Reset that saver's animation */
void saver_step(saver_id_t id);             /* Clear the framebuffer and draw one frame */
const char *saver_name(saver_id_t id);
void saver_tetris_stats(uint32_t *games, uint32_t *total_lines);   /* For debugging */

#endif /* _UI_SAVER_H_ */
