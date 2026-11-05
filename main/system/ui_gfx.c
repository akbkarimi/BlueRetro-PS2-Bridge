/*
 * 1 bit framebuffer + drawing primitives for an SSD1306 OLED.
 * Local addition, not part of upstream BlueRetro.
 * SPDX-License-Identifier: Apache-2.0
 */

#include "sdkconfig.h"

#include "sdkconfig.h"

#ifdef CONFIG_BLUERETRO_SYSTEM_PSX_PS2

#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "ui_gfx.h"

static uint8_t fb[GFX_BUF_MAX];
static int off_x;
static int off_y;
static int panel_h = UI_OLED_HEIGHT;    /* Active panel height, 32 or 64 */

/* 5x7 font, ASCII 32..90 (space to Z), one byte per column, bit0 = top. */
static const uint8_t font5x7[59][5] = {
    {0x00,0x00,0x00,0x00,0x00}, /* space */
    {0x00,0x00,0x5F,0x00,0x00}, /* ! */
    {0x00,0x07,0x00,0x07,0x00}, /* " */
    {0x14,0x7F,0x14,0x7F,0x14}, /* # */
    {0x24,0x2A,0x7F,0x2A,0x12}, /* $ */
    {0x23,0x13,0x08,0x64,0x62}, /* % */
    {0x36,0x49,0x56,0x20,0x50}, /* & */
    {0x00,0x00,0x07,0x00,0x00}, /* ' */
    {0x00,0x1C,0x22,0x41,0x00}, /* ( */
    {0x00,0x41,0x22,0x1C,0x00}, /* ) */
    {0x2A,0x1C,0x7F,0x1C,0x2A}, /* * */
    {0x08,0x08,0x3E,0x08,0x08}, /* + */
    {0x00,0x80,0x70,0x30,0x00}, /* , */
    {0x08,0x08,0x08,0x08,0x08}, /* - */
    {0x00,0x00,0x60,0x60,0x00}, /* . */
    {0x20,0x10,0x08,0x04,0x02}, /* / */
    {0x3E,0x51,0x49,0x45,0x3E}, /* 0 */
    {0x00,0x42,0x7F,0x40,0x00}, /* 1 */
    {0x72,0x49,0x49,0x49,0x46}, /* 2 */
    {0x21,0x41,0x49,0x4D,0x33}, /* 3 */
    {0x18,0x14,0x12,0x7F,0x10}, /* 4 */
    {0x27,0x45,0x45,0x45,0x39}, /* 5 */
    {0x3C,0x4A,0x49,0x49,0x31}, /* 6 */
    {0x41,0x21,0x11,0x09,0x07}, /* 7 */
    {0x36,0x49,0x49,0x49,0x36}, /* 8 */
    {0x46,0x49,0x49,0x29,0x1E}, /* 9 */
    {0x00,0x00,0x14,0x00,0x00}, /* : */
    {0x00,0x40,0x34,0x00,0x00}, /* ; */
    {0x00,0x08,0x14,0x22,0x41}, /* < */
    {0x14,0x14,0x14,0x14,0x14}, /* = */
    {0x00,0x41,0x22,0x14,0x08}, /* > */
    {0x02,0x01,0x59,0x09,0x06}, /* ? */
    {0x3E,0x41,0x5D,0x59,0x4E}, /* @ */
    {0x7C,0x12,0x11,0x12,0x7C}, /* A */
    {0x7F,0x49,0x49,0x49,0x36}, /* B */
    {0x3E,0x41,0x41,0x41,0x22}, /* C */
    {0x7F,0x41,0x41,0x41,0x3E}, /* D */
    {0x7F,0x49,0x49,0x49,0x41}, /* E */
    {0x7F,0x09,0x09,0x09,0x01}, /* F */
    {0x3E,0x41,0x41,0x51,0x73}, /* G */
    {0x7F,0x08,0x08,0x08,0x7F}, /* H */
    {0x00,0x41,0x7F,0x41,0x00}, /* I */
    {0x20,0x40,0x41,0x3F,0x01}, /* J */
    {0x7F,0x08,0x14,0x22,0x41}, /* K */
    {0x7F,0x40,0x40,0x40,0x40}, /* L */
    {0x7F,0x02,0x1C,0x02,0x7F}, /* M */
    {0x7F,0x04,0x08,0x10,0x7F}, /* N */
    {0x3E,0x41,0x41,0x41,0x3E}, /* O */
    {0x7F,0x09,0x09,0x09,0x06}, /* P */
    {0x3E,0x41,0x51,0x21,0x5E}, /* Q */
    {0x7F,0x09,0x19,0x29,0x46}, /* R */
    {0x26,0x49,0x49,0x49,0x32}, /* S */
    {0x03,0x01,0x7F,0x01,0x03}, /* T */
    {0x3F,0x40,0x40,0x40,0x3F}, /* U */
    {0x1F,0x20,0x40,0x20,0x1F}, /* V */
    {0x3F,0x40,0x38,0x40,0x3F}, /* W */
    {0x63,0x14,0x08,0x14,0x63}, /* X */
    {0x03,0x04,0x78,0x04,0x03}, /* Y */
    {0x61,0x59,0x49,0x4D,0x43}, /* Z */
};

void gfx_clear(void) {
    memset(fb, 0, sizeof(fb));
}

void gfx_set_panel_h(int h) {
    if (h == 32 || h == 64) {
        panel_h = h;
    }
}

int gfx_h(void) {
    return panel_h;
}

void gfx_set_offset(int dx, int dy) {
    off_x = dx;
    off_y = dy;
}

void gfx_pixel(int x, int y, int on) {
    x += off_x;
    y += off_y;
    if (x < 0 || x >= GFX_W || y < 0 || y >= panel_h) {
        return;
    }
    uint8_t *p = &fb[(y >> 3) * GFX_W + x];
    uint8_t m = (uint8_t)(1u << (y & 7));

    if (on) {
        *p |= m;
    }
    else {
        *p &= (uint8_t)~m;
    }
}

void gfx_line(int x0, int y0, int x1, int y1, int on) {
    int dx = abs(x1 - x0);
    int dy = -abs(y1 - y0);
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;

    for (;;) {
        gfx_pixel(x0, y0, on);
        if (x0 == x1 && y0 == y1) {
            break;
        }
        int e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
}

void gfx_fill_rect(int x, int y, int w, int h, int on) {
    for (int j = 0; j < h; j++) {
        for (int i = 0; i < w; i++) {
            gfx_pixel(x + i, y + j, on);
        }
    }
}

void gfx_rect(int x, int y, int w, int h, int on) {
    if (w <= 0 || h <= 0) {
        return;
    }
    gfx_fill_rect(x, y, w, 1, on);
    gfx_fill_rect(x, y + h - 1, w, 1, on);
    gfx_fill_rect(x, y, 1, h, on);
    gfx_fill_rect(x + w - 1, y, 1, h, on);
}

void gfx_circle(int cx, int cy, int r, int on) {
    int x = r;
    int y = 0;
    int err = 1 - r;

    while (x >= y) {
        gfx_pixel(cx + x, cy + y, on);
        gfx_pixel(cx + y, cy + x, on);
        gfx_pixel(cx - y, cy + x, on);
        gfx_pixel(cx - x, cy + y, on);
        gfx_pixel(cx - x, cy - y, on);
        gfx_pixel(cx - y, cy - x, on);
        gfx_pixel(cx + y, cy - x, on);
        gfx_pixel(cx + x, cy - y, on);
        y++;
        if (err < 0) {
            err += 2 * y + 1;
        }
        else {
            x--;
            err += 2 * (y - x) + 1;
        }
    }
}

void gfx_fill_circle(int cx, int cy, int r, int on) {
    for (int dy = -r; dy <= r; dy++) {
        int dx = 0;

        while ((dx + 1) * (dx + 1) + dy * dy <= r * r + r) {
            dx++;
        }
        gfx_fill_rect(cx - dx, cy + dy, 2 * dx + 1, 1, on);
    }
}

int gfx_text(int x, int y, const char *s) {
    for (; *s; s++) {
        int c = toupper((unsigned char)*s);

        if (c < 32 || c > 90) {
            c = '?';
        }
        const uint8_t *g = font5x7[c - 32];

        for (int col = 0; col < 5; col++) {
            for (int row = 0; row < 7; row++) {
                if (g[col] & (1 << row)) {
                    gfx_pixel(x + col, y + row, 1);
                }
            }
        }
        x += 6;
    }
    return x;
}

/* ---------------- 7-segment big digits ---------------- */

/* Segment bit order: A top, B top-right, C bottom-right, D bottom,
   E bottom-left, F top-left, G middle */
static const uint8_t seg_digit[10] = {
    0x3F, /* 0: A B C D E F   */
    0x06, /* 1: B C           */
    0x5B, /* 2: A B G E D     */
    0x4F, /* 3: A B C D G     */
    0x66, /* 4: F G B C       */
    0x6D, /* 5: A F G C D     */
    0x7D, /* 6: A F G E C D   */
    0x07, /* 7: A B C         */
    0x7F, /* 8: all           */
    0x6F, /* 9: A B C D F G   */
};

/* Draw one 7-segment digit inside the box (x, y, w, h) */
static void seg_draw_digit(int x, int y, int w, int h, int digit) {
    int t = h / 7;
    if (t < 2) t = 2;
    if (t > w / 5) t = w / 5;
    if (t < 2) t = 2;
    int mid = y + (h - t) / 2;
    uint8_t seg = (digit >= 0 && digit <= 9) ? seg_digit[digit] : 0;

    if (w < 2 * t + 2 || h < 3 * t) {
        /* Too small for 7 segments: fall back to the 5x7 font */
        char b[2] = { (char)('0' + digit), 0 };

        gfx_text(x, y, b);
        return;
    }

    if (seg & 0x01) gfx_fill_rect(x + t, y, w - 2 * t, t, 1);               /* A */
    if (seg & 0x40) gfx_fill_rect(x + t, mid, w - 2 * t, t, 1);             /* G */
    if (seg & 0x08) gfx_fill_rect(x + t, y + h - t, w - 2 * t, t, 1);       /* D */
    if (seg & 0x02) gfx_fill_rect(x + w - t, y + t, t, mid - y - t, 1);     /* B */
    if (seg & 0x10) gfx_fill_rect(x + w - t, mid + t, t, y + h - mid - 2 * t, 1); /* C */
    if (seg & 0x20) gfx_fill_rect(x, y + t, t, mid - y - t, 1);             /* F */
    if (seg & 0x04) gfx_fill_rect(x, mid + t, t, y + h - mid - 2 * t, 1);   /* E */
}

void gfx_big_num(int x, int y, int w, int h, int value) {
    int gap = (h >= 30) ? 3 : 2;
    int digit_w = (w - gap) / 2;
    int used = 2 * digit_w + gap;
    int x0 = x + (w - used) / 2;

    if (digit_w < 4) {
        return;
    }
    seg_draw_digit(x0, y, digit_w, h, (value / 10) % 10);
    seg_draw_digit(x0 + digit_w + gap, y, digit_w, h, value % 10);
}

void gfx_big_hhmm(int x, int y, int w, int h, int hh, int mm, int colon_on) {
    /* Keep seven-segment digits tall and narrow instead of stretching each
     * digit to one quarter of the entire 128-pixel panel. */
    int t = h / 7;
    if (t < 2) t = 2;
    if (t > w / 22) t = w / 22;
    if (t < 2) t = 2;

    int gap = (h >= 30) ? 3 : 2;
    int colon_w = (t > 4) ? t + 2 : 5;
    int max_digit_w = (h * 4) / 5;
    int available_digit_w = (w - colon_w - 4 * gap) / 4;
    int digit_w = (available_digit_w < max_digit_w) ? available_digit_w : max_digit_w;
    int used = 4 * digit_w + colon_w + 4 * gap;
    int x0 = x + (w - used) / 2;
    int xc = x0 + 2 * digit_w + 2 * gap;
    int dot_y1 = y + h / 3 - t / 2;
    int dot_y2 = y + (2 * h) / 3 - t / 2;

    if (digit_w < 2 * t + 2 || h < 3 * t) {
        return;
    }

    seg_draw_digit(x0, y, digit_w, h, (hh / 10) % 10);
    seg_draw_digit(x0 + digit_w + gap, y, digit_w, h, hh % 10);
    if (colon_on) {
        gfx_fill_rect(xc + (colon_w - t) / 2, dot_y1, t, t, 1);
        gfx_fill_rect(xc + (colon_w - t) / 2, dot_y2, t, t, 1);
    }
    seg_draw_digit(xc + colon_w + gap, y, digit_w, h, (mm / 10) % 10);
    seg_draw_digit(xc + colon_w + gap + digit_w + gap, y, digit_w, h, mm % 10);
}

const uint8_t *gfx_buffer(void) {
    return fb;
}

#endif /* CONFIG_BLUERETRO_SYSTEM_PSX_PS2 */
