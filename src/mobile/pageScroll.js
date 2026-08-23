// Scroll-snap paging math for the mobile home grid. The pages live in a
// horizontal scroll-snap container; these keep the container's scroll
// position and the app's currentPage index in lockstep.

export function pageFromScroll(scrollLeft, pageWidth, pageCount) {
  if (!pageWidth || pageCount <= 0) return 0
  const idx = Math.round(scrollLeft / pageWidth)
  return Math.min(Math.max(idx, 0), pageCount - 1)
}

export function scrollLeftForPage(page, pageWidth) {
  return Math.max(0, page) * pageWidth
}
