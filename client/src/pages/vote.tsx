import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptchaChallenge } from "@/components/captcha-challenge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useClerk } from "@clerk/clerk-react";
import type { Name } from "@shared/schema";
import { ArrowRight, Sparkles, ShieldCheck, TrendingUp, TrendingDown, RefreshCcw, UserPlus } from "lucide-react";
import { Link } from "wouter";

interface Matchup {
  nameA: Name;
  nameB: Name;
  voteAttemptId: string;
}

interface UserCaptchaInfo {
  captchaDifficulty: number;
  captchaDebt: number;
  voteRequiredCount: number;
  voteDifficulty: number;
}

export default function VotePage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const clerk = useClerk();
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [showPreauthCaptcha, setShowPreauthCaptcha] = useState(false);
  const [pendingVote, setPendingVote] = useState<{ winnerId: string; loserId: string; attemptId: string } | null>(null);
  const [lastResult, setLastResult] = useState<{ winner: string; loser: string; delta: number } | null>(null);
  const [preauthCompleted, setPreauthCompleted] = useState(false);

  const { data: matchup, isLoading: matchupLoading, refetch: refetchMatchup } = useQuery<Matchup>({
    queryKey: ["/api/vote/matchup"],
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const { data: captchaInfo } = useQuery<UserCaptchaInfo>({
    queryKey: ["/api/user/captcha-info"],
    enabled: isAuthenticated,
    staleTime: 10000,
  });

  const voteMutation = useMutation({
    mutationFn: async (data: { winnerId: string; loserId: string; voteAttemptId: string; captchaPlanId: string }) => {
      const res = await apiRequest("POST", "/api/vote", data);
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult({ winner: data.winnerName, loser: data.loserName, delta: data.eloDelta });
      queryClient.invalidateQueries({ queryKey: ["/api/vote/matchup"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/captcha-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      const fmtDelta = data.eloDelta.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      toast({ title: "Vote recorded!", description: `${data.winnerName} +${fmtDelta} / ${data.loserName} -${fmtDelta} ELO` });
      setShowCaptcha(false);
      setPendingVote(null);
      refetchMatchup();
    },
    onError: (err: Error) => {
      toast({ title: "Vote failed", description: err.message, variant: "destructive" });
      setShowCaptcha(false);
      setPendingVote(null);
    },
  });

  const handleVote = useCallback((winnerId: string, loserId: string) => {
    if (!matchup) return;
    if (!isAuthenticated) {
      setShowPreauthCaptcha(true);
      return;
    }
    setPendingVote({ winnerId, loserId, attemptId: matchup.voteAttemptId });
    setShowCaptcha(true);
  }, [isAuthenticated, matchup]);

  const handleVoteCaptchaComplete = useCallback((planId: string) => {
    if (!pendingVote) return;
    voteMutation.mutate({
      winnerId: pendingVote.winnerId,
      loserId: pendingVote.loserId,
      voteAttemptId: pendingVote.attemptId,
      captchaPlanId: planId,
    });
  }, [pendingVote, voteMutation]);

  const handlePreauthComplete = useCallback((_planId: string) => {
    setPreauthCompleted(true);
    setShowPreauthCaptcha(false);
  }, []);

  if (preauthCompleted && !isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="text-center space-y-4">
          <UserPlus className="h-10 w-10 mx-auto text-primary" />
          <h2 className="text-xl font-semibold" data-testid="text-preauth-success">Challenges Complete!</h2>
          <p className="text-sm text-muted-foreground">
            You've proven you're human. Now create an account to start voting.
          </p>
          <Button
            onClick={() => clerk.openSignUp()}
            data-testid="button-signup-after-captcha"
          >
            Create Account
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clerk.openSignIn()}
              data-testid="button-signin-after-captcha"
            >
              Already have an account? Sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showPreauthCaptcha && !isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-6 space-y-2">
          <ShieldCheck className="h-8 w-8 mx-auto text-primary" />
          <h2 className="text-xl font-semibold" data-testid="text-preauth-title">Verify You're Human</h2>
          <p className="text-sm text-muted-foreground">
            Complete 4 security challenges before creating your account. This helps prevent spam.
          </p>
        </div>
        <CaptchaChallenge
          planType="preauth"
          onComplete={handlePreauthComplete}
          onCancel={() => setShowPreauthCaptcha(false)}
        />
      </div>
    );
  }

  if (showCaptcha && pendingVote) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <ShieldCheck className="h-8 w-8 mx-auto text-primary mb-2" />
          <h2 className="text-xl font-semibold">Verify Your Vote</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete the security check to submit your vote
          </p>
        </div>
        <CaptchaChallenge
          planType="vote"
          onComplete={handleVoteCaptchaComplete}
          onCancel={() => { setShowCaptcha(false); setPendingVote(null); }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-page-title">
          What Should the US Be Called?
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Vote between two candidate names. Rankings are tracked separately for Americans and international voters.
        </p>
      </div>

      {lastResult && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              <strong>{lastResult.winner}</strong> <span className="text-green-600 dark:text-green-400">+{lastResult.delta.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              {" / "}
              <strong>{lastResult.loser}</strong> <span className="text-red-500 dark:text-red-400">-{lastResult.delta.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              {" ELO"}
            </span>
            <Link href="/leaderboard" className="text-primary font-medium hover:underline" data-testid="link-view-leaderboard">
              View Leaderboard <ArrowRight className="inline h-3 w-3" />
            </Link>
          </div>
        </Card>
      )}

      {matchupLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-2" />
              <Skeleton className="h-10 w-full mt-4" />
            </Card>
          ))}
        </div>
      ) : matchup ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[matchup.nameA, matchup.nameB].map((name, idx) => {
              const other = idx === 0 ? matchup.nameB : matchup.nameA;
              const eloKey = user?.isAmerican ? "eloAmerican" : "eloNonAmerican";
              const elo = name[eloKey];
              const otherElo = other[eloKey];
              const isHigher = elo > otherElo;

              return (
                <Card
                  key={name.id}
                  role="button"
                  tabIndex={0}
                  className="p-5 flex flex-col gap-4 hover-elevate active-elevate-2 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => !voteMutation.isPending && handleVote(name.id, other.id)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !voteMutation.isPending) { e.preventDefault(); handleVote(name.id, other.id); } }}
                  data-testid={`card-vote-${idx}`}
                >
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-semibold leading-snug" data-testid={`text-name-${idx}`}>
                      {name.text}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">
                        {isHigher ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                        {Math.round(elo).toLocaleString()} ELO
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {name.voteCountTotal.toLocaleString()} votes
                      </span>
                    </div>
                  </div>
                  <div className="w-full text-center text-sm font-medium text-primary flex items-center justify-center gap-1" data-testid={`button-vote-${idx}`}>
                    Vote for this
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => refetchMatchup()} data-testid="button-skip-matchup">
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              Skip this matchup
            </Button>
          </div>
        </>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No matchups available yet. Names need to be submitted first.</p>
        </Card>
      )}

      {isAuthenticated && captchaInfo && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-sm text-foreground">Your Anti-Spam Stats</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span>Captcha Difficulty:</span>
                <span className="font-mono">{captchaInfo.captchaDifficulty}</span>
                <span>Captcha Debt:</span>
                <span className="font-mono">{captchaInfo.captchaDebt}</span>
                <span>Challenges per vote:</span>
                <span className="font-mono">{captchaInfo.voteRequiredCount}</span>
                <span>Vote difficulty:</span>
                <span className="font-mono">{captchaInfo.voteDifficulty}</span>
              </div>
              <Link href="/about" className="text-primary inline-flex items-center gap-1 mt-1">
                How does this work? <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
