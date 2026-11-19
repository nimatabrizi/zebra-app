import localFont from "next/font/local";
import {
  Anton,
  Archivo_Black,
  Barlow_Condensed,
  Bebas_Neue,
  DM_Sans,
  Geist,
  Geist_Mono,
  Inter,
  Lato,
  Montserrat,
  Open_Sans,
  Oswald,
  Playfair_Display,
  Poppins,
  Raleway,
} from "next/font/google";

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas-neue",
  subsets: ["latin"],
});

export const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
});

export const oswald = Oswald({
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-oswald",
  subsets: ["latin", "latin-ext"],
});

export const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  subsets: ["latin", "latin-ext"],
});

/**
 * Yerel Roboto — Turbopack + Google Fonts kit URL (&skey=) hatasını önler
 * (next/font/google: "queries have exactly one entry").
 */
export const roboto = localFont({
  src: [
    {
      path: "./fonts/roboto/latin-ext-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/roboto/latin-ext-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/roboto/latin-ext-700.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/roboto/latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/roboto/latin-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/roboto/latin-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-roboto",
  display: "swap",
});

export const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "latin-ext"],
});

export const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "latin-ext"],
});

export const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin", "latin-ext"],
});

export const barlowCondensed = Barlow_Condensed({
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
  subsets: ["latin", "latin-ext"],
});

export const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin", "latin-ext"],
});

export const lato = Lato({
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  subsets: ["latin", "latin-ext"],
});

export const archivoBlack = Archivo_Black({
  weight: "400",
  variable: "--font-archivo-black",
  subsets: ["latin", "latin-ext"],
});

export const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
});

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

/** Yerel Teko — Vercel Turbopack + fonts.gstatic çözümleme hatasını önler */
export const teko = localFont({
  src: [
    {
      path: "./fonts/teko/teko-latin-variable.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-teko",
  display: "swap",
});

/** CSS variables for root <html> — used by studio font pickers + export */
export const studioFontVariables = [
  geistSans.variable,
  geistMono.variable,
  bebasNeue.variable,
  montserrat.variable,
  oswald.variable,
  poppins.variable,
  roboto.variable,
  openSans.variable,
  playfair.variable,
  anton.variable,
  barlowCondensed.variable,
  raleway.variable,
  lato.variable,
  archivoBlack.variable,
  dmSans.variable,
  inter.variable,
  teko.variable,
].join(" ");
