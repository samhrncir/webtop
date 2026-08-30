// The home-screen grid is width-capped and centered, so a mouse wheel turned
// over the empty gutters beside it lands on a non-scrollable ancestor and
// nothing moves. Forwarding the wheel delta to the grid makes the whole
// screen scroll the grid, no matter where the cursor sits.
export function forwardGutterWheel(grid, e) {
  if (!grid) return
  // Over the grid itself native scrolling already handles the wheel —
  // forwarding too would scroll twice per notch
  if (grid.contains(e.target)) return
  // deltaMode 1 reports lines (Firefox); scale to a pixel-ish step
  const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
  grid.scrollTop += dy
}

// Curried so the component can hand the whole handler off: the ref is read
// per event, and the function itself lives here where the unit tests run.
export const gutterWheelHandler = (gridRef) => (e) => forwardGutterWheel(gridRef.current, e)
