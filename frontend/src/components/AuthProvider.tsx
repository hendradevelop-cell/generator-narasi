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

type ProfileState = { userId: string; profile: Profile | null } | null;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      // Event SIGNED_IN juga muncul saat tab kembali aktif; jangan reset status
      // profil bila user-nya sama supaya UI tidak tertahan di "Memuat sesi…".
      setSession(next);
      if (!next) setProfileState(null);
      setLoading(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!supabaseConfigured || !userId) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("id,email,nama,role")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return;
        setProfileState({ userId, profile: error ? null : (data as Profile) });
      });
    return () => {
      alive = false;
    };
  }, [userId, refreshTick]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfileState(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfileState(null);
    setRefreshTick((tick) => tick + 1);
  }, []);

  const profileLoading = Boolean(userId) && profileState?.userId !== userId;
  const profile =
    profileState && profileState.userId === userId ? profileState.profile : null;

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
