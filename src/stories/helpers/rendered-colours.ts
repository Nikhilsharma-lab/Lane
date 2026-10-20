// Browser-side contrast checks for actual rendered surfaces, including alpha.
export function rgba(value: string) {
  const context = document.createElement("canvas").getContext("2d")!
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  return [...context.getImageData(0, 0, 1, 1).data]
}

function over(front: number[], back: number[]) {
  return front.slice(0, 3).map((value, index) => value * front[3] / 255 + back[index] * (1 - front[3] / 255))
}

/** The colour an element sits on, composited over every ancestor's background. */
export function background(element: Element) {
  const ancestors: Element[] = []
  for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node)
  return ancestors.reduce((back, node) => over(rgba(getComputedStyle(node).backgroundColor), back), [255, 255, 255])
}

function ratio(a: number[], b: number[]) {
  const luminance = (rgb: number[]) => rgb.map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

export function textContrast(element: Element) {
  const back = background(element)
  return ratio(over(rgba(getComputedStyle(element).color), back), back)
}

export function controlContrast(element: Element, color: string) {
  const back = background(element)
  return ratio(over(rgba(color), back), back)
}

/** Resolve a semantic CSS token through the browser, including rem/calc values. */
export function resolvedStyle(element: Element, property: string, value: string) {
  const probe = document.createElement("span")
  probe.style.setProperty(property, value)
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  element.append(probe)
  const result = getComputedStyle(probe).getPropertyValue(property)
  probe.remove()
  return result
}

/** Conservative contrast over solid surfaces and every stop of a CSS gradient.
 * If the foreground luminance falls inside the background range, the lower
 * bound is 1:1; do not silently treat a gradient as its background-color. */
export function textContrastDetails(element: HTMLElement) {
  const ancestors: Element[] = []
  for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node)
  let backgrounds = [[255, 255, 255]]
  for (const node of ancestors) {
    const css = getComputedStyle(node)
    if (Number(css.opacity) !== 1) throw new Error("Measure settled, fully visible text")
    backgrounds = backgrounds.map(back => over(rgba(css.backgroundColor), back))
    if (css.backgroundImage !== "none") {
      if (!css.backgroundImage.startsWith("linear-gradient(")) throw new Error(`Unsupported background: ${css.backgroundImage}`)
      const stops = css.backgroundImage.match(/(?:rgba?|oklch|color)\([^)]+\)/g) ?? []
      if (stops.length < 2) throw new Error(`Unsupported gradient: ${css.backgroundImage}`)
      backgrounds = backgrounds.flatMap(back => stops.map(stop => over(rgba(stop), back)))
    }
  }
  const foreground = rgba(getComputedStyle(element).color)
  const samples = backgrounds.map(background => ({ ratio: ratio(over(foreground, background), background), foreground: over(foreground, background), background }))
  // A monotone RGB path between stops can cross the text luminance even when
  // both endpoints pass. Sample its range conservatively, using luminance.
  const luminance = (color: number[]) => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
  const levels = backgrounds.map(luminance)
  const textLevel = luminance(foreground)
  const worst = samples.reduce((a, b) => a.ratio < b.ratio ? a : b)
  return foreground[3] === 255 && textLevel >= Math.min(...levels) && textLevel <= Math.max(...levels)
    ? { ...worst, ratio: 1 } : worst
}
