# p5 garden

An art toy built on [svelte-p5](https://github.com/edw1nzhao/svelte-p5): drag living, generative elements
(blooms, swarms, ribbons) onto a dark canvas, then move, grow and turn them.

The scene is Svelte state: a list of elements with a position, scale, rotation and seed. p5 only draws
it, and the selection handles are Svelte DOM over the canvas. Elements are seeded, so a composition
draws the same way every time.

## How it uses svelte-p5

p5 garden is a working example of the library's patterns, so each choice below links to the guide it follows.

| Feature                                                                                     | svelte-p5 API                                                                       | Guide                                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Canvas sized to its box, sharp on HiDPI                                                     | `<Sketch>` from `svelte-p5-components`                                              | [Three layers](https://svelte-p5.dev/docs/architecture)               |
| The scene is a `$state` class that p5 reads every frame                                     | Reactive class bridge (option 3)                                                    | [State bridges](https://svelte-p5.dev/docs/bridges)                   |
| Screen-reader text that follows the scene                                                   | `description` prop (svelte-p5 1.3)                                                  | [Accessibility](https://svelte-p5.dev/docs/accessibility)             |
| Redraw only on change under reduced motion                                                  | `loop="demand"` with a `bridge`                                                     | [On-demand rendering](https://svelte-p5.dev/docs/on-demand-rendering) |
| `width`/`height` read once per frame                                                        | p5 2 performance advice                                                             | [p5 1 to 2 pitfalls](https://svelte-p5.dev/docs/p5-2-pitfalls)        |
| p5 draws pixels; selection, panels and palette are Svelte                                   | The library's governing rule                                                        | [Three layers](https://svelte-p5.dev/docs/architecture)               |
| Save poster at 3x, without the selection overlay                                            | `<ExportButton>` with `downloadCanvas` options                                      | [Exporting images and frames](https://svelte-p5.dev/docs/export)      |
| Selection, grips and buttons sit over the canvas                                            | `<Sketch>` `children`; `ExportButton` finds the sketch through `getSketchContext()` | [Sketch context](https://svelte-p5.dev/docs/sketch-context)           |
| Code view: the garden as a svelte-p5 component or p5.js sketch, or opened in the playground | `<P5Canvas>` in the export; the playground's share-link format                      | [Playground](https://svelte-p5.dev/playground)                        |

The drawing code lives in one plain-JavaScript file, `src/lib/garden/art.js`. The app draws with it, and
the code view copies it verbatim, so an exported sketch runs exactly what the app runs.

## Run it

```sh
pnpm install
pnpm dev
```

## Controls

- Drag a seed from the left onto the canvas, or click it (or press Enter) to plant it in the centre.
- Drag an element to move it, or use the Move, Turn and Resize grips under it.
- Select a plant to change its colour, shape and speed in the side panel; with nothing selected,
  the panel sets the backdrop, wind and glow.
- Switch to Paint and drag to paint vine, shimmer or silk strokes.
- Click again on the same spot to select the plant underneath; Ctrl/⌘+Z undoes, Shift+Ctrl/⌘+Z redoes.
- Code shows the garden as a svelte-p5 component or p5.js sketch, ready to copy or open in the playground.
- With the canvas focused: arrow keys move, `+`/`-` grow and shrink, `[`/`]` turn, Delete removes,
  Escape deselects.
- With reduced motion on, the garden redraws only when you change it.
- Ctrl/⌘ + wheel or a trackpad pinch zooms about the cursor; the wheel, Space-drag or middle-drag
  pans; `0` or the zoom readout resets. Zoomed out, you can plant past the stage edge.
- Clear empties the garden, with an Undo toast.

## Hands

Press Hands to play with your webcam. Tracking runs entirely in the browser; the hand model and
wasm are served from this site, so no video or landmarks leave the device. The first time, a short
guide checks which hand is which, then learns your own hand shapes.

Your drawing hand (Right by default, switch it in the Garden panel) pinches to act: pinch a plant to
grab and move it, or in Paint, pinch and move to paint. Your other hand holds a shape to choose what happens:

| Other hand                      | Drawing hand pinches                                     |
| ------------------------------- | -------------------------------------------------------- |
| Fist / one finger / two fingers | paints vine / silk / shimmer                             |
| Three fingers                   | mirror painting                                          |
| L (thumb and index)             | picks a hue by height; it stays after you drop the L     |
| Open palm                       | waving makes a breeze                                    |
| Both palms open and still       | clears the garden after a short countdown                |
| Both hands pinch                | zoom and pan the canvas, or resize and turn a held plant |

Point at a seed in the left rail and hold, or pinch it: the drawing hand plants it, the other hand
latches it so each pinch on empty soil plants that seed. `?debug-hands` shows labels, timings and
confidence; `?record-hands` downloads a clip of landmarks when Hands is turned off. If the camera
mixes up your hands, use Swap left and right in the Garden panel.

## Checks

```sh
pnpm check     # svelte-check
pnpm test      # unit tests (scene, geometry and the camera-free hand pipeline)
pnpm test:e2e  # Playwright tests
```
