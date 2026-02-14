import { Switch, Route } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import { CaptchaChallenge } from "@/components/captcha-challenge";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import VotePage from "@/pages/vote";
import LeaderboardPage from "@/pages/leaderboard";
import SubmitPage from "@/pages/submit";
import AboutPage from "@/pages/about";
import AccountPage from "@/pages/account";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

function PingTracker() {
  useEffect(() => {
    const ping = () => {
      fetch("/api/ping", { method: "POST", credentials: "include" }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={VotePage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/submit" component={SubmitPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/account" component={AccountPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RegistrationGate({ children }: { children: React.ReactNode }) {
  const { needsActivation, isLoading } = useAuth();
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  if (isLoading) return <>{children}</>;
  if (!needsActivation || activated) return <>{children}</>;

  const handleCaptchaComplete = async (planId: string) => {
    setActivating(true);
    try {
      const res = await apiRequest("POST", "/api/auth/activate", { captchaPlanId: planId });
      const data = await res.json();
      if (data.activated) {
        setActivated(true);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    } catch {
      setActivating(false);
    }
  };

  return (
    <>
      <Header />
      <main className="pb-12">
        <div className="max-w-md mx-auto px-4 py-12">
          <div className="text-center mb-6 space-y-2">
            <ShieldCheck className="h-10 w-10 mx-auto text-primary" />
            <h2 className="text-xl font-semibold" data-testid="text-activation-title">Activate Your Account</h2>
            <p className="text-sm text-muted-foreground">
              Complete 4 security challenges to verify you are human and activate your account. This helps us prevent spam.
            </p>
          </div>
          {activating ? (
            <Card className="p-8">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Activating your account...</p>
              </div>
            </Card>
          ) : (
            <CaptchaChallenge
              planType="registration"
              onComplete={handleCaptchaComplete}
            />
          )}
        </div>
      </main>
      <PingTracker />
    </>
  );
}

function AppContent() {
  const { needsActivation, isLoading } = useAuth();

  if (!isLoading && needsActivation) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <RegistrationGate>{null}</RegistrationGate>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="pb-12">
        <Router />
      </main>
      <PingTracker />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AppContent />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
