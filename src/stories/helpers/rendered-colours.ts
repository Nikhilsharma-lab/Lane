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

function background(element: Element) {
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
