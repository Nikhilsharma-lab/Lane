import { OnboardingChrome } from "@/components/auth/onboarding-chrome"
import { LoadingRegion } from "@/components/ui/loading-region"

export default function OnboardingLoading() {
  return (
    <OnboardingChrome>
      <LoadingRegion label="Preparing onboarding" className="space-y-8">
        <div className="space-y-2">
          <div className="h-9 w-60 rounded-md bg-muted" />
          <div className="h-5 w-full max-w-[390px] rounded bg-muted" />
          <div className="h-5 w-4/5 rounded bg-muted" />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="h-[18px] w-20 rounded bg-muted" />
            <div className="h-control-form-touch rounded-lg border border-border bg-card sm:h-control-form" />
          </div>

          <div className="space-y-2">
            <div className="h-[18px] w-16 rounded bg-muted" />
            <div className="divide-y divide-border border-y border-border">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="flex min-h-[56px] items-center gap-3 px-2 sm:min-h-[58px] sm:px-3"
                >
                  <div className="size-[18px] shrink-0 rounded bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-52 max-w-full rounded bg-muted" />
                  </div>
                  <div className="size-[18px] shrink-0 rounded-full border border-input" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-control-form-touch rounded-lg bg-muted sm:h-control-form" />
      </LoadingRegion>
    </OnboardingChrome>
  )
}
