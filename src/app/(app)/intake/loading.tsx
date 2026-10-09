import { Skeleton } from "@/components/arc/skeleton/skeleton";
export default function IntakeLoading() {
  return <div aria-label="Loading Intake" aria-busy="true" className="mx-auto w-full max-w-2xl space-y-8 px-5 py-6"><Skeleton label="Loading Intake" lines={2} /><Skeleton lines={5} /><Skeleton lines={4} /></div>;
}
