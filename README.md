# ಕಡಲು · kadalu

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

Dolphins hunting fish off the Karnataka coast, drawn in Kannada
letters on a canvas, seen from above. Zero runtime dependencies.

```sh
npm install && npm run dev
```

```ts
import { SeaEngine } from "./src";

new SeaEngine(canvas, { dolphins: 4, theme: "dark" }); // or theme: "light"
```

The canvas's CSS `font-family` is the font used; the demo loads Noto Sans Kannada.

## What you're looking at

Everything is seen from above; the whole screen is sea. On the light theme
the letters turn to ink: denser where the skin is in shadow.

Each animal is written in the letters of its own Kannada name, ordered from
light to heavy ink.

- **Dolphins** are a mosaic of small shaded tiles, each carrying a letter of
  ಕಡಲಹಂದಿ (*kaḍala handi*, "sea pig", a coastal name for the dolphin): light
  ಲ ಕ where there's little ink, through ದ ಡ, to heavy ಹ. Lit from the upper
  left, with a beak, flippers out to the sides, a dorsal ridge, a ೦ blowhole
  and crescent flukes. Each has its own skin: slate grey, the pink-grey of
  the Indo-Pacific humpback dolphins seen off Karnataka, a darker bottlenose
  grey, or a paler, older humpback. Their bodies bend through every turn as
  they cruise and hunt.
- **Fish** are mosaics in muted oranges (apricot, burnt orange, amber,
  salmon), close in hue to the pink-grey dolphins, with forked, beating
  tails. They're written in the letters of ಮೀನು (*mīnu*, "fish"): ನ at the
  faint edges, ಮ in the body. Each swims alone on its own meandering course,
  keeps its distance from the others, and bolts when a dolphin comes close.
- **Wakes and ripples** are faint ೦ bubbles.

Move the mouse to scatter the fish. Click the water: a ripple spreads, the
fish scatter, and the nearest dolphin dashes over.

`?theme=light` swaps the black sea for white cells on blue grid lines. `?dolphins=4` sets the pod size (up to 10; the default is 4, or 3 on small screens). `prefers-reduced-motion` gets one settled frame.

Indo-Pacific humpback and bottlenose dolphins are regularly seen off Karwar,
Netrani Island and Udupi.

Inspired by [ascii-sharks](https://github.com/stackedlol/ascii-sharks).

MIT
