import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useClerk } from "@clerk/clerk-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CaptchaChallenge } from "@/components/captcha-challenge";
import { User, ShieldCheck, Clock, MapPin, Trash2 } from "lucide-react";

interface UserProfile {
  id: string;
  displayName: string;
  isValidAccount: boolean;
  createdAt: string;
  detectedCountry: string | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  JP: "Japan",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  CN: "China",
  KR: "South Korea",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  IE: "Ireland",
  NZ: "New Zealand",
  ZA: "South Africa",
  SG: "Singapore",
  PH: "Philippines",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  RU: "Russia",
  UA: "Ukraine",
  TR: "Turkey",
  EG: "Egypt",
  NG: "Nigeria",
  KE: "Kenya",
  IL: "Israel",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  TH: "Thailand",
  VN: "Vietnam",
  ID: "Indonesia",
  MY: "Malaysia",
  PT: "Portugal",
  AT: "Austria",
  CH: "Switzerland",
  BE: "Belgium",
  CZ: "Czech Republic",
  RO: "Romania",
  HU: "Hungary",
  GR: "Greece",
};

function formatCountry(code: string | null): string {
  if (!code) return "Unknown";
  return COUNTRY_NAMES[code] || code;
}

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const clerk = useClerk();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteCaptcha, setShowDeleteCaptcha] = useState(false);

  const deleteAccountMutation = useMutation({
    mutationFn: async (captchaPlanId: string) => {
      const res = await apiRequest("DELETE", "/api/auth/account", { captchaPlanId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete account");
      }
      return res.json();
    },
    onSuccess: async () => {
      queryClient.clear();
      await clerk.signOut();
      window.location.href = "/";
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setShowDeleteCaptcha(false);
      setShowDeleteConfirm(false);
    },
  });

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <User className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold" data-testid="text-account-not-signed-in">Sign in to view your account</h2>
        <p className="text-sm text-muted-foreground">
          You need to be signed in to see your account details and voting preferences.
        </p>
        <Button onClick={() => clerk.openSignIn()} data-testid="button-account-sign-in">
          Sign In
        </Button>
      </div>
    );
  }

  if (profileLoading || !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const accountAge = profile.createdAt
    ? Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60))
    : 0;
  const accountAgeDays = Math.floor(accountAge / 24);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-account-title">Account</h1>
        <p className="text-sm text-muted-foreground">Your profile and account details</p>
      </div>

      <Card className="p-5">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold" data-testid="text-display-name">{profile.displayName}</p>
              <p className="text-xs text-muted-foreground font-mono" data-testid="text-user-id">{profile.id.slice(0, 8)}...</p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span>Account Status</span>
              </div>
              <Badge variant={profile.isValidAccount ? "default" : "secondary"} data-testid="badge-account-status">
                {profile.isValidAccount ? "Active" : "Pending Activation"}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Account Age</span>
              </div>
              <span className="text-sm text-muted-foreground" data-testid="text-account-age">
                {accountAgeDays > 0 ? `${accountAgeDays.toLocaleString()}d ${(accountAge % 24).toLocaleString()}h` : `${accountAge.toLocaleString()}h`}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Detected Country</span>
              </div>
              <span className="text-sm" data-testid="text-detected-country">
                {profile.detectedCountry ? (
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{profile.detectedCountry}</span>
                    <span>{formatCountry(profile.detectedCountry)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not detected</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 border-destructive/30">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h3 className="font-semibold text-sm">Delete Account</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account and all associated data including your votes and activity history. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="button-delete-account"
            >
              Delete My Account
            </Button>
          ) : showDeleteCaptcha ? (
            <div className="space-y-3 p-3 bg-destructive/5 rounded-md">
              <p className="text-sm font-medium text-destructive">
                Complete the verification to confirm account deletion.
              </p>
              <CaptchaChallenge
                planType="delete"
                onComplete={(planId) => {
                  deleteAccountMutation.mutate(planId);
                }}
                onCancel={() => {
                  setShowDeleteCaptcha(false);
                  setShowDeleteConfirm(false);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-destructive/5 rounded-md">
              <p className="text-sm font-medium text-destructive">
                Are you sure? This will permanently delete your account and all your data. You will need to complete a verification challenge to proceed.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteCaptcha(true)}
                  data-testid="button-confirm-delete-account"
                >
                  Yes, Delete Everything
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="button-cancel-delete-account"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}
