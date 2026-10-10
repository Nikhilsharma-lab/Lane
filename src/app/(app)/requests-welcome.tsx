import Link from "next/link"
import { NewRequestLink } from "@/components/requests/new-request-link"
import { Inbox } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import buttonStyles from "@/components/arc/button/button.module.css"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"

export function RequestsWelcome({ role }: { role: "admin" | "member" | "guest" }) {
  const isGuest = role === "guest"

  return (
    <div data-slot="requests-workspace" className="min-h-dvh w-full min-w-0 p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
      <header className="space-y-1">
        <div className="flex items-center gap-3"><SidebarExpandButton /><h1 className="text-xl font-medium tracking-tight">{isGuest ? "My Requests" : "Requests"}</h1></div>
        {isGuest && <p className="text-sm text-muted-foreground">Only Requests you submit appear here.</p>}
      </header>

      <EmptyState
        className="my-auto"
        label="No Requests yet"
        title="No Requests yet"
        description="Create a Request for your team to review and pick up."
        icon={<Inbox size={24} />}
        action={<>
          <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>New Request</NewRequestLink>
          {role === "admin" && (
            <Link href="/settings/members" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>
              Invite teammates
            </Link>
          )}
        </>}
      />
      </div>
    </div>
  )
}
