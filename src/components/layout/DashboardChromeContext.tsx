"use client";

import { createContext, useContext } from "react";

export type DashboardChromeValue = {
  notificationsHref?: string;
  checklistsHref?: string;
};

const DashboardChromeContext = createContext<DashboardChromeValue>({});

export function DashboardChromeProvider({
  value,
  children,
}: {
  value: DashboardChromeValue;
  children: React.ReactNode;
}) {
  return (
    <DashboardChromeContext.Provider value={value}>
      {children}
    </DashboardChromeContext.Provider>
  );
}

export function useDashboardChrome() {
  return useContext(DashboardChromeContext);
}
