# p5 garden

An art toy built on [svelte-p5](https://github.com/edw1nzhao/svelte-p5): drag living, generative elements
(blooms, swarms, ribbons) onto a dark canvas, then move, grow and turn them.

The scene is Svelte state: a list of elements with a position, scale, rotation and seed. p5 only draws
it, and the selection handles are Svelte DOM over the canvas. Elements are seeded, so a composition
draws the same way every time.

## Run it

```sh
pnpm install
pnpm dev
```

## Controls

- Drag a seed from the left onto the canvas, or click it (or press Enter) to plant it in the centre.
- Drag an element to move it; use the round handles to grow it and turn it.
- With the canvas focused: arrow keys move, `+`/`-` grow and shrink, `[`/`]` turn, Delete removes,
  Escape deselects.
- With reduced motion on, the garden redraws only when you change it.

## Checks

```sh
pnpm check     # svelte-check
pnpm test      # unit tests (scene and geometry)
pnpm test:e2e  # Playwright drag-and-drop tests
```
