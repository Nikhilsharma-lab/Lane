import { renderToStaticMarkup } from "react-dom/server"
import { ToastStackProvider, useToastStack, useToastStackState, type ToastStackApi, type ToastStackState } from "@/components/arc/toast-stack/toast-stack"

/** Retains the actual provider's commands; timers and interaction still require a browser. */
export function toastStack(limit?: number) {
  let api: ToastStackApi | undefined
  let state: ToastStackState | undefined
  function Probe() {
    api = useToastStack()
    state = useToastStackState()
    return null
  }
  renderToStaticMarkup(<ToastStackProvider limit={limit}><Probe /></ToastStackProvider>)
  if (!api || !state) throw new Error("Toast stack probe did not render")
  const source = state
  return { ...api, state: source, get toasts() { return source.getSnapshot() } }
}
