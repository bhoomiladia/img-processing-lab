"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearSession, getStoredStaff, getToken, storeStaff, type Staff } from "./api";

type AuthState = {
  staff: Staff | null;
  ready: boolean;
  signOut: () => void;
  setProfile: (staff: Staff) => void;
};

const AuthContext = createContext<AuthState>({ staff: null, ready: false, signOut: () => {}, setProfile: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const setProfile = useCallback((p: Staff) => {
    storeStaff(p);
    setStaff(p);
  }, []);

  useEffect(() => {
    if (getToken()) {
      setStaff(getStoredStaff());
      // Refresh flags (password change, onboarding) that may have changed elsewhere.
      api<Staff>("/auth/me").then(setProfile).catch(() => {});
    }
    setReady(true);
  }, [setProfile]);

  useEffect(() => {
    if (!ready) return;
    if (!staff) {
      if (pathname !== "/login" && pathname !== "/signup") router.replace("/login");
    } else if (staff.must_change_password && pathname !== "/welcome") {
      router.replace("/welcome");
    }
  }, [ready, staff, pathname, router]);

  const signOut = () => {
    clearSession();
    setStaff(null);
    router.replace("/login");
  };

  return <AuthContext.Provider value={{ staff, ready, signOut, setProfile }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
