import type { MetricChart as MetricChartView, Series } from "@/lib/impact-chart-view"
import styles from "./metric-chart.module.css"

// One metric's chart (#158). It draws the values its MetricChartView carries on that metric's own scale, and says the
// same values in words on the SVG for screen readers. It computes no totals and never combines metrics. Colours come
// from the theme's series tokens and sizes from the stylesheet; the only numbers here are the SVG's own geometry.

const SERIES_ORDER: Series[] = ["baseline", "actual", "predicted"]
const LEGEND: { series: Series; label: string }[] = [
  { series: "baseline", label: "Baseline" },
  { series: "actual", label: "Actual" },
  { series: "predicted", label: "Predicted" },
]

export function MetricChart({ chart }: { chart: MetricChartView | null }) {
  if (!chart || chart.groups.length === 0) return <p className={styles.empty}>Nothing measured yet</p>

  const groupWidth = 100 / chart.groups.length
  const slot = groupWidth / SERIES_ORDER.length
  return <figure className={styles.chart}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={chart.description} className={styles.plot}>
      {chart.groups.map((group, groupIndex) => group.bars.map(bar => <rect
        key={`${group.requestNumber}-${bar.series}`}
        className={styles.bar}
        data-series={bar.series}
        x={groupIndex * groupWidth + SERIES_ORDER.indexOf(bar.series) * slot + slot * 0.1}
        width={slot * 0.8}
        y={100 - bar.height}
        height={bar.height}
      />))}
    </svg>
    <figcaption>
      <ul className={styles.legend}>
        {LEGEND.map(item => <li key={item.series} className={styles.legendItem}>
          <span aria-hidden="true" className={styles.swatch} data-series={item.series} />{item.label}
        </li>)}
      </ul>
    </figcaption>
  </figure>
}
