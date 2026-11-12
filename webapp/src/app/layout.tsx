import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BlueRetro PS2 Bridge WebApp",
  description:
    "Config tool for the BlueRetro PS2 Bridge over Web Bluetooth: OLED 128x32/128x64, screensavers, 27 melodies, per-port LED colors, ports and system commands.",
  keywords: ["BlueRetro", "ESP32", "PS2", "Web Bluetooth", "OLED", "SSD1306"],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
