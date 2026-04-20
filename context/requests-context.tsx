"use client";

import { createContext, useContext } from "react";
import type { ShellRequest } from "@/lib/dashboard/shell-data";

const RequestsContext = createContext<ShellRequest[]>([]);

export function RequestsProvider({
  requests,
  children,
}: {
  requests: ShellRequest[];
  children: React.ReactNode;
}) {
  return (
    <RequestsContext.Provider value={requests}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests(): ShellRequest[] {
  return useContext(RequestsContext);
}
