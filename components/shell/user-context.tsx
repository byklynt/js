"use client";

import { createContext, useContext } from "react";

export type DashboardUser = { username: string; email: string };

const UserContext = createContext<DashboardUser>({ username: "Pengguna", email: "" });

export const UserProvider = UserContext.Provider;

export function useDashboardUser(): DashboardUser {
  return useContext(UserContext);
}
