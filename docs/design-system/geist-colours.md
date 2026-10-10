# Geist colour source audit — 2026-10-08

Read the live stylesheets and rendered examples on [Colors](https://vercel.com/geist/colors) and [Introduction](https://vercel.com/geist/introduction). These values were not sampled from screenshots. `src/styles/geist-colors.css` preserves every published HSL fallback and all P3 OKLCH overrides for the eight hues, gray, gray alpha and the two backgrounds. The existing six hue ramps matched the live source exactly; teal and pink complete the source palette.

## Roles verified on the pages

- Example panels: Background 100 (`#ffffff` light; `#0a0a0a` dark). Secondary canvas: Background 200 (`#fafafa` light; `#000000` dark).
- Gauge fills: Green 700, Amber 700, **Red 800**. Track: Gray Alpha 400.
- Coloured example icons: Green, Blue, Purple, Amber, Pink and Teal **900**.
- Introduction bars: Gray 800, Blue 800, **Purple 700**, Pink 800, Red 800, Amber 800, Green 800 and Teal 800. Their containers use Background 200 and Gray Alpha 400 borders.
- Selected controls: Blue **300** background / Blue **900** content in both native theme ramps. Selected Request pills and owner avatars share the pair and use a 1px `--selection-property-border`: Blue **700** in light mode, Blue **600** in dark mode. The previous unchanged Gray 400 stroke measured only 1.026:1 on selected blue. Focused or open metadata retains a Blue **900** border cue. Unselected hover stays neutral, and unselected status badges keep their semantic roles.
- Deselecting a Request: row focus follows keyboard-visible title/property focus; checkbox focus stays on its square. After pointer exit, an unselected row returns to the normal surface. The border and deselection regressions reproduced both defects before the fix; 12/12 focused browser stories now pass at 1440px light and 390px dark, including both regressions, at least 3:1 selected metadata stroke contrast and at least 4.5:1 text contrast. These are local checks.
- Group heading separation: 8px before list content; no gap between adjacent selected Requests.

Bright chart/bar fills are not used as small text colours. Each role uses its matching source step rather than assigning one accent value everywhere.

## Exact wide-gamut values

These are the published OKLCH values, applied only when P3 and OKLCH are supported. The corresponding original HSL fallbacks are preserved alongside them in the stylesheet.

| Token | Light | Dark |
| --- | --- | --- |
| Blue 100 | `oklch(97.32% .0141 251.56)` | `oklch(22.17% .069 259.89)` |
| Blue 200 | `oklch(96.29% .0195 250.59)` | `oklch(25.45% .0811 255.8)` |
| Blue 300 | `oklch(94.58% .0293 249.849)` | `oklch(30.86% .1022 255.21)` |
| Blue 400 | `oklch(91.58% .0473 245.116)` | `oklch(34.1% .121 254.74)` |
| Blue 500 | `oklch(82.75% .0979 248.48)` | `oklch(38.5% .1403 254.4)` |
| Blue 600 | `oklch(73.08% .1583 248.133)` | `oklch(64.94% .1982 251.813)` |
| Blue 700 | `oklch(57.61% .2508 258.23)` | `oklch(57.61% .2321 258.23)` |
| Blue 800 | `oklch(51.51% .2399 257.85)` | `oklch(51.51% .2307 257.85)` |
| Blue 900 | `oklch(53.18% .2399 256.99)` | `oklch(71.7% .1648 250.794)` |
| Blue 1000 | `oklch(26.67% .1099 254.34)` | `oklch(96.75% .0179 242.423)` |
| Red 100 | `oklch(96.5% .0223 13.09)` | `oklch(22.1% .0657 15.11)` |
| Red 200 | `oklch(95.41% .0299 14.2526)` | `oklch(25.93% .0834 19.02)` |
| Red 300 | `oklch(94.33% .0369 15.0115)` | `oklch(31.47% .1105 20.96)` |
| Red 400 | `oklch(91.51% .0471 19.8)` | `oklch(35.27% .1273 21.23)` |
| Red 500 | `oklch(84.47% .1018 17.71)` | `oklch(40.68% .1479 23.16)` |
| Red 600 | `oklch(71.12% .1881 21.22)` | `oklch(62.56% .2277 23.03)` |
| Red 700 | `oklch(62.56% .2524 23.03)` | `oklch(62.56% .2234 23.03)` |
| Red 800 | `oklch(58.19% .2482 25.15)` | `oklch(58.01% .227 25.12)` |
| Red 900 | `oklch(54.99% .232 25.29)` | `oklch(69.96% .2136 22.03)` |
| Red 1000 | `oklch(24.8% .1041 18.86)` | `oklch(95.6% .0293 6.61)` |
| Amber 100 | `oklch(97.48% .0331 85.79)` | `oklch(22.46% .0538 76.04)` |
| Amber 200 | `oklch(96.81% .0495 90.2423)` | `oklch(24.95% .0642 64.78)` |
| Amber 300 | `oklch(95.93% .0636 90.52)` | `oklch(32.34% .0837 63.83)` |
| Amber 400 | `oklch(91.02% .1322 88.25)` | `oklch(35.53% .0903 66.2971)` |
| Amber 500 | `oklch(86.55% .1583 79.63)` | `oklch(41.55% .1044 67.98)` |
| Amber 600 | `oklch(80.25% .1953 73.59)` | `oklch(75.04% .1737 74.49)` |
| Amber 700 | `oklch(81.87% .1969 76.46)` | `oklch(81.87% .1969 76.46)` |
| Amber 800 | `oklch(77.21% .1991 64.28)` | `oklch(77.21% .1991 64.28)` |
| Amber 900 | `oklch(52.79% .1496 54.65)` | `oklch(77.21% .1991 64.28)` |
| Amber 1000 | `oklch(30.83% .099 45.48)` | `oklch(96.7% .0418 84.59)` |
| Green 100 | `oklch(97.59% .0289 145.42)` | `oklch(23.09% .0716 149.68)` |
| Green 200 | `oklch(96.92% .037 147.15)` | `oklch(27.12% .0895 150.09)` |
| Green 300 | `oklch(94.6% .0674 144.23)` | `oklch(29.84% .096 149.25)` |
| Green 400 | `oklch(91.49% .0976 146.24)` | `oklch(34.39% .1039 147.78)` |
| Green 500 | `oklch(85.45% .1627 146.3)` | `oklch(44.19% .1484 147.2)` |
| Green 600 | `oklch(80.25% .214 145.18)` | `oklch(58.11% .1815 146.55)` |
| Green 700 | `oklch(64.58% .1746 147.27)` | `oklch(64.58% .199 147.27)` |
| Green 800 | `oklch(57.81% .1507 147.5)` | `oklch(57.81% .1776 147.5)` |
| Green 900 | `oklch(51.75% .1453 147.65)` | `oklch(73.1% .2158 148.29)` |
| Green 1000 | `oklch(29.15% .1197 147.38)` | `oklch(96.76% .056 154.18)` |
| Teal 100 | `oklch(97.72% .0359 186.7)` | `oklch(22.1% .0544 178.74)` |
| Teal 200 | `oklch(97.06% .0347 180.66)` | `oklch(25.06% .062 178.76)` |
| Teal 300 | `oklch(94.92% .0478 182.07)` | `oklch(31.5% .0767 180.99)` |
| Teal 400 | `oklch(92.76% .0718 183.78)` | `oklch(32.43% .0763 180.13)` |
| Teal 500 | `oklch(86.88% .1344 182.42)` | `oklch(43.35% .1055 180.97)` |
| Teal 600 | `oklch(81.5% .161 178.96)` | `oklch(60.71% .1485 180.24)` |
| Teal 700 | `oklch(64.92% .1572 181.95)` | `oklch(64.92% .1403 181.95)` |
| Teal 800 | `oklch(57.53% .1392 181.66)` | `oklch(57.53% .1392 181.66)` |
| Teal 900 | `oklch(52.08% .1251 182.93)` | `oklch(74.56% .1765 182.8)` |
| Teal 1000 | `oklch(32.11% .0788 179.82)` | `oklch(96.46% .056 180.29)` |
| Purple 100 | `oklch(96.65% .0244 312.189)` | `oklch(22.34% .0779 316.87)` |
| Purple 200 | `oklch(96.73% .0228 309.8)` | `oklch(25.91% .0921 314.41)` |
| Purple 300 | `oklch(94.85% .0364 310.15)` | `oklch(31.98% .1219 312.41)` |
| Purple 400 | `oklch(91.77% .0614 312.82)` | `oklch(35.93% .1504 309.78)` |
| Purple 500 | `oklch(81.26% .1409 310.8)` | `oklch(40.99% .1721 307.92)` |
| Purple 600 | `oklch(72.07% .2083 308.19)` | `oklch(55.5% .2191 306.12)` |
| Purple 700 | `oklch(55.5% .3008 306.12)` | `oklch(55.5% .2186 306.12)` |
| Purple 800 | `oklch(48.58% .2638 305.73)` | `oklch(48.58% .2102 305.73)` |
| Purple 900 | `oklch(47.18% .2579 304)` | `oklch(69.87% .2037 309.51)` |
| Purple 1000 | `oklch(23.96% .13 305.66)` | `oklch(96.1% .0304 316.46)` |
| Pink 100 | `oklch(95.69% .0359 344.622)` | `oklch(22.67% .0628 354.73)` |
| Pink 200 | `oklch(95.71% .0321 353.14)` | `oklch(26.2% .0859 356.68)` |
| Pink 300 | `oklch(93.83% .0451 356.29)` | `oklch(31.15% .1067 355.93)` |
| Pink 400 | `oklch(91.12% .0573 358.82)` | `oklch(32.13% .1174 356.71)` |
| Pink 500 | `oklch(84.28% .0915 356.99)` | `oklch(37.01% .1453 358.39)` |
| Pink 600 | `oklch(74.33% .1547 .24)` | `oklch(50.33% .2089 4.33)` |
| Pink 700 | `oklch(63.52% .238 1.01)` | `oklch(63.52% .2346 1.01)` |
| Pink 800 | `oklch(59.51% .2339 4.21)` | `oklch(59.51% .2429 4.21)` |
| Pink 900 | `oklch(53.5% .2058 2.84)` | `oklch(69.36% .2223 3.91)` |
| Pink 1000 | `oklch(26% .0977 359)` | `oklch(95.74% .0326 350.08)` |

## Neutral values

8-bit hex equivalents of the published neutral HSL values; the original HSL remains canonical in the stylesheet.

| Token | Light | Dark |
| --- | --- | --- |
| Background 100 | `#ffffff` | `#0a0a0a` |
| Background 200 | `#fafafa` | `#000000` |
| Gray 100 | `#f2f2f2` | `#1a1a1a` |
| Gray 200 | `#ebebeb` | `#1f1f1f` |
| Gray 300 | `#e6e6e6` | `#292929` |
| Gray 400 | `#ebebeb` | `#2e2e2e` |
| Gray 500 | `#c9c9c9` | `#454545` |
| Gray 600 | `#a8a8a8` | `#878787` |
| Gray 700 | `#8f8f8f` | `#8f8f8f` |
| Gray 800 | `#7d7d7d` | `#7d7d7d` |
| Gray 900 | `#4c4c4c` | `#a1a1a1` |
| Gray 1000 | `#171717` | `#ededed` |
