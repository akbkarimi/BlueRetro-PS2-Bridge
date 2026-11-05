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
 * (mx_config.h). The local console-logo saver reuses the old PAD slot so
 * existing numeric saver IDs remain stable.
 */
typedef enum {
    SAVER_CUBE = 0,     /* Rotating wireframe diamond (idle_cube) */
    SAVER_STARS,        /* Scrolling starfield */
    SAVER_TETRIS,       /* Tetris playing itself */
    SAVER_SYMBOLS,      /* Bouncing cross, circle, triangle, square */
    SAVER_BALLS,        /* Bouncing square balls */
    SAVER_PONG,         /* Pong demo */
    SAVER_CLOCK_ANALOG, /* Reserved legacy slot: intentionally disabled */
    SAVER_CLOCK_FLIP,   /* Reserved legacy slot: intentionally disabled */
    SAVER_CLOCK_RECT,   /* Rectangular clock (HH:MM / DD-MM) */
    SAVER_LOGO_PS,      /* "Logo PS" bitmap from the spec workbook */
    SAVER_LOGO_PLAYSTATION, /* "Logo playstation" bitmap */
    SAVER_LOGOS,        /* Classic Nintendo / SEGA / Xbox bitmap carousel */
    SAVER_SYMBOLS_FILLED,
    SAVER_SYMBOLS_FLOATING,
    SAVER_SYMBOL_TETRIS,
    SAVER_COUNT,
} saver_id_t;

/* Source compatibility for older local code; numeric ID remains unchanged. */
#define SAVER_PAD SAVER_LOGOS

void saver_seed(uint32_t seed);
void saver_start(saver_id_t id);            /* Reset that saver's animation */
void saver_step(saver_id_t id);             /* Clear the framebuffer and draw one frame */
const char *saver_name(saver_id_t id);
void saver_tetris_stats(uint32_t *games, uint32_t *total_lines);   /* For debugging */

#endif /* _UI_SAVER_H_ */
