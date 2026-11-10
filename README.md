# ಕಡಲು · kadalu (ocean)

```
                 ದಡ
                  ಡಹ
        ಲಕದಡಹಹಹಹಹಹಹಡದಕ              ಹಡ
  ಲಕದಡಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಹಡದಕಲಕದಡಹಹ
        ಲಕದಡಹಹಹಹಹಹಹಡದಕ              ಹಡ
                  ಡಹ
                 ದಡ
                                        ನಮಮಮ
      ನಮಮಮ                  ನಮಮಮ
```

Dolphins hunting fish off the Karnataka coast, inspired by my dolphin watching at [Om Beach](https://www.google.com/search?sca_esv=c37d4853c79ba7e1&sxsrf=AKL5yDh1RLbPsHyigzpiZWnEo2PvVHiZ8A:1794280062837&udm=2&fbs=ACAhTvwdifjn2dKXmjtOfBxVFl_koHVe5RLSnJlTH2QYaq_YVfnwA0k4pzZ9d-ZbRA0e6twiIZ3143njO9lVkG2CPCx-CPU1s3TIfm2LvslANp1Btnz-wYMvScn-eBWIzVts6YKnYRAMeotQQdHyIXGm9cm4wInYYfqBGlK_hBRiJxlzhyJX7UP2kIRyeu67nS8xlJT_Vfcz9Va8tf2581-RjBO25lXi-g&q=om+beach&sa=X&sqi=2&ved=2ahUKEwjr95aOtvyXAxVpk4kEHYAEJ2oQtKgLegQIFRAB&biw=1440&bih=728&dpr=2), near my hometown, [Kumta](https://en.wikipedia.org/wiki/Kumta).
Drawn in [Kannada](https://en.wikipedia.org/wiki/Kannada) letters on a canvas, seen from above. Zero runtime dependencies.

```sh
npm install && npm run dev
```

```ts
import { SeaEngine } from "./src";

new SeaEngine(canvas, { dolphins: 4, theme: "dark" }); // or theme: "light"
```

The canvas's CSS `font-family` is the font used; the demo loads Noto Sans Kannada.

## What you're looking at

Everything is seen from above; the whole screen is sea.

Each animal is written in the letters of its own Kannada name.

- **Dolphins** carry a letter of ಕಡಲಹಂದಿ (*kaḍala handi*, "sea pig", a coastal
  name for the dolphin). Each has its own skin: slate grey, the pink-grey of
  the Indo-Pacific humpback dolphins seen off Karnataka, a darker bottlenose
  grey, or a paler, older humpback.
  
- **Fish** are mosaics in muted oranges (apricot, burnt orange, amber,
  salmon), close in hue to the pink-grey dolphins, with forked, beating
  tails. They're written in the letters of ಮೀನು (*mīnu*, "fish"). Each
  swims alone on its own meandering course, keeps its distance from the others,
  and bolts when a dolphin comes close.


Move the mouse to scatter the fish. Click the water: a ripple spreads, the
fish scatter, and the nearest dolphin dashes over.


Indo-Pacific humpback and bottlenose dolphins are regularly seen off [Karwar](https://en.wikipedia.org/wiki/Karwar),
Netrani Island and Udupi.

Inspired by [ascii-sharks](https://github.com/stackedlol/ascii-sharks).

MIT
