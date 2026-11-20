// PROTOTYPE (#346), throwaway: Lane's own sign-in, invitation and account screens on Better Auth, in Arc.
// Lives on `prototype/auth-screens` only; never merged. No Better Auth, Clerk or database calls: every
// send, check and save is a stub in memory.
//
// Plan: three variants of the sign-in flow (/login, /signup, and how they share one form), switchable via
// `?variant=A|B|C`; every other screen has one design with its states, picked with `?screen=` and `?state=`.
import { notFound } from "next/navigation";
import { AuthPrototype } from "./auth-prototype";

export const metadata = { title: "Prototype: auth screens" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen = "login", state, variant = "A" } = await searchParams;
  return <AuthPrototype screen={screen} state={state} variant={variant} />;
}
