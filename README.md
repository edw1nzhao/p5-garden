# p5 garden

An art toy built on [svelte-p5](https://github.com/edw1nzhao/svelte-p5): drag living, generative elements
(blooms, swarms, ribbons) onto a dark canvas, then move, grow and turn them.

The scene is Svelte state: a list of elements with a position, scale, rotation and seed. p5 only draws
it, and the selection handles are Svelte DOM over the canvas. Elements are seeded, so a composition
draws the same way every time.

## How it uses svelte-p5

p5 garden is a working example of the library's patterns, so each choice below links to the guide it follows.

| Feature                                                   | svelte-p5 API                          | Guide                                                                 |
| --------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Canvas sized to its box, sharp on HiDPI                   | `<Sketch>` from `svelte-p5-components` | [Three layers](https://svelte-p5.dev/docs/architecture)               |
| The scene is a `$state` class that p5 reads every frame   | Reactive class bridge (option 3)       | [State bridges](https://svelte-p5.dev/docs/bridges)                   |
| Screen-reader text that follows the scene                 | `description` prop (svelte-p5 1.3)     | [Accessibility](https://svelte-p5.dev/docs/accessibility)             |
| Redraw only on change under reduced motion                | `loop="demand"` with a `bridge`        | [On-demand rendering](https://svelte-p5.dev/docs/on-demand-rendering) |
| `width`/`height` read once per frame                      | p5 2 performance advice                | [p5 1 to 2 pitfalls](https://svelte-p5.dev/docs/p5-2-pitfalls)        |
| p5 draws pixels; selection, panels and palette are Svelte | The library's governing rule           | [Three layers](https://svelte-p5.dev/docs/architecture)               |

Not used yet, and planned: poster export with `downloadCanvas` / `<ExportButton>`
([Exporting images and frames](https://svelte-p5.dev/docs/export)), and moving the selection overlay into
`<Sketch>`'s `children` snippet with `getSketchContext()` ([Sketch context](https://svelte-p5.dev/docs/sketch-context)).

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
- With the canvas focused: arrow keys move, `+`/`-` grow and shrink, `[`/`]` turn, Delete removes,
  Escape deselects.
- With reduced motion on, the garden redraws only when you change it.

## Checks

```sh
pnpm check     # svelte-check
pnpm test      # unit tests (scene and geometry)
pnpm test:e2e  # Playwright drag-and-drop tests
```
