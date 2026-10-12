import type { Metadata, Viewport } from "next";
import { studioFontVariables } from "./fonts";
import { ThemeProvider } from "../components/ThemeProvider";
import SquareMeterInputs from "../components/SquareMeterInputs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zebra 360",
  description: "Zebra 360 uygulama paneli",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zebra 360",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f3f5",
  colorScheme: "light dark",
};

const themeBootScript = `
(function(){
  try {
    var t = localStorage.getItem('zebra-theme');
    if (t !== 'light' && t !== 'dark') t = 'light';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      data-theme="light"
      suppressHydrationWarning
      className={`${studioFontVariables} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--z-bg)] text-[var(--z-fg)]">
        <ThemeProvider>{children}</ThemeProvider>
        <SquareMeterInputs />
      </body>
    </html>
  );
}
