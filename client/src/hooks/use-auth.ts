import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useEffect } from "react";
import type { User } from "@shared/schema";

export function useAuth() {
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const { signOut, getToken } = useClerkAuth();

  const { data: appUser, isLoading: appUserLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  useEffect(() => {
    if (!clerkLoaded) return;

    if (isSignedIn && clerkUser) {
      const displayName = clerkUser.fullName || clerkUser.firstName || "Voter";
      getToken().then(token => {
        if (!token) return;
        fetch("/api/auth/clerk-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ displayName }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }).catch(() => {});
      });
    } else if (!isSignedIn && appUser) {
      fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }).catch(() => {});
    }
  }, [clerkLoaded, isSignedIn, clerkUser?.id]);

  const isLoading = !clerkLoaded || appUserLoading;
  const isAuthenticated = !!isSignedIn && !!appUser;
  const needsActivation = isAuthenticated && appUser && !appUser.isValidAccount;

  return {
    user: appUser ?? null,
    isLoading,
    isAuthenticated,
    needsActivation,
    logout: async () => { await signOut(); },
    clerkUser,
  };
}
