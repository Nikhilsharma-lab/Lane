import Link from "next/link"
import { ArrowRight, Check, Plus, Users } from "lucide-react"

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/utils"

const steps = [
  { title: "Describe the situation", description: "Start with what happened and who it affects." },
  { title: "Review the framing", description: "Lane helps clarify the problem. You confirm it." },
  { title: "Share the Request", description: "Follow the work from Open to In Progress to Done." },
]

export function RequestsWelcome({ role }: { role: "admin" | "member" | "guest" }) {
  const isGuest = role === "guest"

  return (
    <main data-slot="requests-workspace" className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="border-b bg-card px-5 py-4 sm:px-8">
        <Typography as="h1" role="pageTitle">{isGuest ? "My Requests" : "Requests"}</Typography>
        <Typography as="p" role="support" className="mt-1 text-muted-foreground">
          {isGuest ? "Only Requests you submit appear here." : "A shared place for the problems your team is solving."}
        </Typography>
      </header>

      <div className="mx-auto grid w-full max-w-[1040px] flex-1 content-center items-start gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-2 lg:gap-12">
        <section aria-labelledby="requests-welcome-title" className="min-w-0 lg:py-6">
          <Empty className="items-start gap-6 rounded-none p-0 text-left">
            <EmptyHeader className="max-w-none items-start gap-4">
              <EmptyTitle id="requests-welcome-title" className="max-w-[22ch] text-type-auth-title-mobile text-balance sm:text-type-auth-title">
                {isGuest ? "What do you need help solving?" : "What does your team need to solve?"}
              </EmptyTitle>
              <EmptyDescription className="max-w-[42ch] text-pretty">
                Describe what’s happening. Lane helps clarify the problem before you share your Request with the team.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-none items-start gap-3">
              <Link href="/intake" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                Create your first Request
                <ArrowRight aria-hidden="true" data-icon="inline-end" className="ml-2" />
              </Link>
              <Typography as="p" role="support" className="max-w-[38ch] text-pretty text-muted-foreground">
                A title and what happened are enough to start. Supporting details are optional.
              </Typography>
            </EmptyContent>
          </Empty>
          {role === "admin" && (
            <div className="mt-8 border-t pt-5">
              <Typography as="p" role="support" className="mb-2 text-muted-foreground">You can start on your own or bring your team in.</Typography>
              <Link href="/settings/members" className={buttonVariants({ variant: "ghost" })}>
                <Users aria-hidden="true" data-icon="inline-start" /> Invite teammates
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </div>
          )}
        </section>

        <Card className="min-w-0">
          <CardHeader className="px-5 py-4">
            <CardTitle><h3>From an ask to a clear problem</h3></CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-6">
            <ol aria-label="How a Request works" className="space-y-6">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-type-meta tabular-nums text-muted-foreground">{index + 1}</span>
                  <div>
                    <Typography as="p" role="control">{step.title}</Typography>
                    <Typography as="p" role="support" className="mt-1 text-muted-foreground">{step.description}</Typography>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
          <CardContent className="overflow-visible px-5 py-1">
            <Accordion>
              <AccordionItem value="example">
                <AccordionTrigger className="min-h-touch-target items-center gap-4 py-4 hover:no-underline">
                  <span>
                    <span className="block">See an example</span>
                    <span className="mt-1 block text-type-support font-normal text-muted-foreground">How a suggested solution becomes a problem to explore.</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <Typography as="p" role="meta" className="text-muted-foreground">Illustrative example · not a saved Request</Typography>
                  <div className="mt-5 space-y-5">
                    <div>
                      <Typography as="h4" role="label" className="text-muted-foreground">The initial ask</Typography>
                      <Typography as="p" role="prose" className="mt-2">“Add a progress bar to signup.”</Typography>
                    </div>
                    <div className="border-t pt-5">
                      <Typography as="h4" role="label" className="flex items-center gap-2 text-brand">
                        <Check aria-hidden="true" className="size-4" /> A possible problem framing
                      </Typography>
                      <Typography as="p" role="prose" className="mt-2">“People may be unsure how much is left to complete during signup.”</Typography>
                    </div>
                  </div>
                  <Typography as="p" role="support" className="mt-5 text-muted-foreground">
                    This is a hypothesis to check. Review Lane’s suggestion and confirm that it reflects what you know.
                  </Typography>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
