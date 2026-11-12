/*
 * 1 bit framebuffer + drawing primitives for an SSD1306 OLED.
 * Pure C, no hardware access. Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef _UI_GFX_H_
#define _UI_GFX_H_

#include <stdint.h>
#include "ui_config.h"

#define GFX_W        128
#define GFX_MAX_H    64
#define GFX_BUF_MAX  (GFX_W * GFX_MAX_H / 8)   /* Full 128x64 buffer, always allocated */
#define GFX_BUF_SIZE GFX_BUF_MAX
#define GFX_H        UI_OLED_HEIGHT             /* Default panel height (UI_OLED_HEIGHT) */

void gfx_clear(void);
void gfx_set_offset(int dx, int dy);        /* Added to every pixel drawn (burn-in pixel shift) */
void gfx_set_panel_h(int h);                /* Select the active panel height: 32 or 64 */
int  gfx_h(void);                           /* Current panel height */
void gfx_pixel(int x, int y, int on);
void gfx_line(int x0, int y0, int x1, int y1, int on);
void gfx_rect(int x, int y, int w, int h, int on);          /* Outline */
void gfx_fill_rect(int x, int y, int w, int h, int on);
void gfx_circle(int cx, int cy, int r, int on);             /* Outline */
void gfx_fill_circle(int cx, int cy, int r, int on);
int  gfx_text(int x, int y, const char *s);                 /* 5x7 font, upper case only. Returns end x */
void gfx_big_num(int x, int y, int w, int h, int value);    /* 2-digit 7-segment number filling the box */
void gfx_big_hhmm(int x, int y, int w, int h, int hh, int mm, int colon_on);
                                                            /* "HH:MM" 7-segment digits filling the box */
void gfx_big_hhmmss(int x, int y, int w, int h, int hh, int mm, int ss);
const uint8_t *gfx_buffer(void);

#endif /* _UI_GFX_H_ */
