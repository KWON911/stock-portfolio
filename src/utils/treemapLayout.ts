import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'

export type TreemapInput<T> = T & { value: number }
export type TreemapTile<T> = { item: T; x: number; y: number; width: number; height: number; value: number }
type LayoutNode<T> = { children?: LayoutNode<T>[]; item?: TreemapInput<T>; value?: number }

/** Squarified layout. Tile area follows value, apart from the small visual gutter. */
export function createTreemapLayout<T>(items: TreemapInput<T>[], width: number, height: number): TreemapTile<T>[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
  const valid = items.filter(item => Number.isFinite(item.value) && item.value > 0).sort((a, b) => b.value - a.value)
  if (!valid.length) return []
  const root = hierarchy<LayoutNode<T>>({ children: valid.map(item => ({ item, value: item.value })) }, node => node.children).sum(node => node.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const laidOut = treemap<LayoutNode<T>>().size([width, height]).paddingInner(0).round(false).tile(treemapSquarify)(root)
  return laidOut.leaves().flatMap(leaf => leaf.data.item ? [{ item: leaf.data.item, x: leaf.x0, y: leaf.y0, width: Math.max(0, leaf.x1 - leaf.x0), height: Math.max(0, leaf.y1 - leaf.y0), value: leaf.value ?? 0 }] : [])
}
