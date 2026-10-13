import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { PageStrip } from "@/components/shell/page-strip"
import { DetailBackLink } from "./detail-back-link"
import detailStyles from "./detail.module.css"

// Its own module, apart from detail-view.tsx: loading.tsx then carries only the
// strip, the back link and Arc Skeleton, not Request detail's client islands.
/** Plan item 2.5: the loaded page's boxes, so the swap to the page does not move the column or the panel.
 * No copy, sequence or action placeholders: the strip is fixed-height and those controls sit at its end. */
export function RequestDetailSkeleton() {
  return <section className={detailStyles.root} data-skeleton="detail" aria-busy="true">
    <PageStrip compactTrail leading={<DetailBackLink href="/" />} title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} />
    <div className={`${detailStyles.body} px-5 py-6 md:px-8`}>
      <div className={detailStyles.layout}>
        <div className={detailStyles.main} data-detail-main="">
          <div className={detailStyles.titleBlock} data-detail-title="">
            <div className={detailStyles.skeletonLine}><Skeleton label="Loading selected Request" lines={1} /></div>
            <div aria-hidden="true" className={detailStyles.skeletonStateLine} />
          </div>
          <div aria-hidden="true" className={detailStyles.skeletonBlocks}><Skeleton lines={3} /><Skeleton lines={4} /></div>
        </div>
        <div aria-hidden="true" className={detailStyles.panel} data-detail-panel="">
          <div className={detailStyles.properties}>
            <div className={detailStyles.propertyGroup}><div className={detailStyles.skeletonRow}><Skeleton lines={1} /><Skeleton lines={1} /></div></div>
            <div className={detailStyles.propertyGroup}>{Array.from({ length: 5 }, (_, index) => <div key={index} className={detailStyles.skeletonRow}><Skeleton lines={1} /><Skeleton lines={1} /></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
}
