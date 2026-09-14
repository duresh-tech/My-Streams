import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/components/theme-provider";
import { InstallCapture } from "@/components/install-capture";
import { APP_NAME } from "@/lib/app-name";
import { APP_LOGO_SRC } from "@/components/app-logo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "System administration console",
  // The brand mark doubles as the tab icon. Declared through the metadata API
  // rather than the app/icon.* file convention, which does not accept webp.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: APP_LOGO_SRC, type: "image/webp" }],
    shortcut: [{ url: APP_LOGO_SRC, type: "image/webp" }],
    apple: [{ url: APP_LOGO_SRC, type: "image/webp" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionConfig reducedMotion="user">
            {children}
            {/* Silent: it registers the service worker and holds on to the
                browser's install offer. The offer is shown by each portal's
                shell, so only a signed-in user sees it. */}
            <InstallCapture />
            <Toaster richColors position="top-right" />
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
