import type { CSSProperties } from "react"
import type { MetricChart as MetricChartView } from "@/lib/impact-chart-view"
import { NOTHING_MEASURED } from "@/lib/impact-presenter"
import styles from "./metric-chart.module.css"

// One metric's chart (#158, #282): Lane's own bars, because Arc's bar chart shows one measure only. Each Request is a
// group of up to three bars (Before release, Result, Goal) with its value over each bar and its code underneath, at a
// fixed modest height with a gap between groups. The same values are said in words for screen readers. It draws what
// its MetricChartView carries and computes nothing. Colours and sizes come from the theme via the stylesheet.

export function MetricChart({ chart }: { chart: MetricChartView | null }) {
  if (!chart || chart.groups.length === 0) return <p className={styles.empty}>{NOTHING_MEASURED}</p>

  return <figure className={styles.chart}>
    <div role="img" aria-label={chart.description} className={styles.plot}>
      {chart.groups.map(group => <div key={group.requestNumber} className={styles.group}>
        <div className={styles.bars}>
          {group.bars.map(bar => <div key={bar.series} className={styles.slot}>
            <span className={styles.value}>{bar.valueLabel}</span>
            <span className={styles.track}>
              <span className={styles.bar} data-series={bar.series} style={{ "--bar-height": `${bar.height}%` } as CSSProperties} />
            </span>
          </div>)}
        </div>
        <span className={styles.code}>{group.code}</span>
      </div>)}
    </div>
    <figcaption>
      <ul className={styles.legend}>
        {chart.legend.map(item => <li key={item.series} className={styles.legendItem}>
          <span aria-hidden="true" className={styles.swatch} data-series={item.series} />{item.label}
        </li>)}
      </ul>
    </figcaption>
  </figure>
}
