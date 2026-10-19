"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setProfileLoading(Boolean(data.session));
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setProfileLoading(false);
      } else if (event !== "TOKEN_REFRESHED") {
        setProfileLoading(true);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const userId = session?.user.id;
    if (!userId) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("id,email,nama,role")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return;
        setProfile(error ? null : (data as Profile));
        setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, refreshTick]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setRefreshTick((tick) => tick + 1);
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      profileLoading,
      configured: supabaseConfigured,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, profileLoading, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}
