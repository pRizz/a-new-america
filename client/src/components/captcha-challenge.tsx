import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle2, XCircle, Lock, Cpu, Type, Calculator, RefreshCw, Clock } from "lucide-react";

interface CaptchaChallengeProps {
  planType: "preauth" | "vote" | "submit" | "registration" | "delete";
  onComplete: (planId: string) => void;
  onCancel?: () => void;
}

interface ChallengeData {
  planId: string;
  challengeId: string;
  engineType: string;
  stepIndex: number;
  totalSteps: number;
  completedSteps: number;
  data: any;
  difficulty: number;
}

const engineIcons: Record<string, typeof Cpu> = {
  pow_a: Cpu,
  pow_b: Cpu,
  svg_text: Type,
  math: Calculator,
};

const engineLabels: Record<string, string> = {
  pow_a: "Proof of Work",
  pow_b: "Hash Challenge",
  svg_text: "Text Recognition",
  math: "Math Problem",
};

export function CaptchaChallenge({ planType, onComplete, onCancel }: CaptchaChallengeProps) {
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solveStatus, setSolveStatus] = useState<"idle" | "success" | "failed">("idle");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenRemaining, setRegenRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [lockoutMessage, setLockoutMessage] = useState("");
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockoutTimerRef.current = setInterval(() => {
        setLockoutSeconds(prev => {
          if (prev <= 1) {
            if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
      };
    }
  }, [lockoutSeconds]);

  const startPlan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/captcha/start", { planType });
      const data = await res.json();
      setChallenge(data);
      if (data.engineType === "pow_a" || data.engineType === "pow_b") {
        solvePow(data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to start captcha");
    } finally {
      setIsLoading(false);
    }
  }, [planType]);

  useEffect(() => {
    startPlan();
  }, [startPlan]);

  async function solvePow(challengeData: ChallengeData) {
    setIsSolving(true);
    const { prefix, target } = challengeData.data;
    const encoder = new TextEncoder();
    let nonce = 0;
    const maxIterations = 10000000;

    const hexLookup = new Array(256);
    for (let i = 0; i < 256; i++) {
      hexLookup[i] = i.toString(16).padStart(2, "0");
    }

    const solveChunk = async () => {
      const chunkSize = 500;
      for (let i = 0; i < chunkSize && nonce < maxIterations; i++, nonce++) {
        const attempt = `${prefix}${nonce}`;
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(attempt));
        const bytes = new Uint8Array(hashBuffer);
        let hex = "";
        const checkLen = Math.min(bytes.length, Math.ceil(target.length / 2) + 1);
        for (let j = 0; j < checkLen; j++) {
          hex += hexLookup[bytes[j]];
        }
        if (hex.startsWith(target)) {
          submitAnswer(challengeData.planId, challengeData.challengeId, nonce.toString());
          setIsSolving(false);
          return;
        }
      }
      if (nonce < maxIterations) {
        setTimeout(solveChunk, 0);
      } else {
        setError("Proof-of-work timed out. Please retry.");
        setIsSolving(false);
      }
    };
    solveChunk();
  }

  async function submitAnswer(planId: string, challengeId: string, userAnswer: string) {
    setIsLoading(true);
    setSolveStatus("idle");
    try {
      const res = await fetch("/api/captcha/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId, challengeId, answer: userAnswer }),
      });
      const data = await res.json();

      if (res.status === 429 && data.lockedOut) {
        setLockoutSeconds(data.lockoutRemainingSeconds || 300);
        setLockoutMessage(data.message || "Too many failed attempts. Please wait before trying again.");
        setError(null);
        setSolveStatus("failed");
        return;
      }

      if (!res.ok && !data.correct) {
        setError(data.message || "Failed to verify");
        setSolveStatus("failed");
        return;
      }

      if (data.correct) {
        setSolveStatus("success");
        if (data.planCompleted) {
          setTimeout(() => onComplete(planId), 500);
        } else {
          setTimeout(() => {
            setAnswer("");
            setChallenge(data.nextChallenge);
            setSolveStatus("idle");
            if (data.nextChallenge?.engineType === "pow_a" || data.nextChallenge?.engineType === "pow_b") {
              solvePow(data.nextChallenge);
            }
          }, 600);
        }
      } else {
        setSolveStatus("failed");
        setError("Incorrect answer. Try again.");
        setTimeout(() => {
          setSolveStatus("idle");
          setError(null);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify");
      setSolveStatus("failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!challenge || isRegenerating || lockoutSeconds > 0) return;
    setIsRegenerating(true);
    setError(null);
    setAnswer("");
    try {
      const res = await fetch("/api/captcha/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planId: challenge.planId,
          challengeId: challenge.challengeId,
        }),
      });
      const data = await res.json();

      if (res.status === 429 && data.lockedOut) {
        setLockoutSeconds(data.lockoutRemainingSeconds || 300);
        setLockoutMessage(data.message || "Too many regeneration requests. Please wait before trying again.");
        setError(null);
        return;
      }

      if (!res.ok) {
        setError(data.message || "Failed to regenerate");
        return;
      }

      setChallenge(prev => prev ? {
        ...prev,
        challengeId: data.challengeId,
        data: data.data,
      } : null);
      if (data.regenerationsRemaining !== undefined) {
        setRegenRemaining(data.regenerationsRemaining);
      }
      if (data.lockedOut) {
        setLockoutSeconds(data.lockoutRemainingSeconds || 300);
        setLockoutMessage("Too many regeneration requests. Please wait before trying again.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to regenerate");
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleSubmitAnswer() {
    if (!challenge || !answer.trim()) return;
    submitAnswer(challenge.planId, challenge.challengeId, answer.trim());
  }

  function formatLockoutTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const canRegenerate = challenge &&
    (challenge.engineType === "svg_text" || challenge.engineType === "math") &&
    lockoutSeconds === 0;

  if (isLoading && !challenge) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Preparing security challenge...</p>
        </div>
      </Card>
    );
  }

  if (error && !challenge) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-3">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={startPlan} variant="outline" size="sm" data-testid="button-retry-captcha">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!challenge) return null;

  const progress = (challenge.completedSteps / challenge.totalSteps) * 100;
  const Icon = engineIcons[challenge.engineType] || Lock;
  const label = engineLabels[challenge.engineType] || "Challenge";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Security Check</span>
        </div>
        <Badge variant="secondary">
          {challenge.completedSteps.toLocaleString()}/{challenge.totalSteps.toLocaleString()}
        </Badge>
      </div>

      <Progress value={progress} className="h-1.5" data-testid="progress-captcha" />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        {challenge.difficulty > 0 && (
          <span className="ml-auto">Difficulty: {challenge.difficulty.toLocaleString()}</span>
        )}
      </div>

      {(challenge.engineType === "pow_a" || challenge.engineType === "pow_b") && (
        <div className="flex flex-col items-center gap-3 py-4">
          {isSolving ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Solving proof-of-work challenge...</p>
              <p className="text-xs text-muted-foreground">This runs automatically in your browser</p>
            </>
          ) : solveStatus === "success" ? (
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {challenge.engineType === "svg_text" && (
        <div className="space-y-3">
          <div
            className="flex justify-center p-3 bg-muted rounded-md"
            dangerouslySetInnerHTML={{ __html: challenge.data.svg }}
            data-testid="captcha-svg-image"
          />
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Enter the text shown above"
              onKeyDown={e => e.key === "Enter" && handleSubmitAnswer()}
              disabled={isLoading || lockoutSeconds > 0}
              data-testid="input-captcha-text"
            />
            <Button
              onClick={handleSubmitAnswer}
              disabled={isLoading || !answer.trim() || lockoutSeconds > 0}
              data-testid="button-submit-captcha"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {challenge.engineType === "math" && (
        <div className="space-y-3">
          <div
            className="flex justify-center p-3 bg-muted rounded-md"
            dangerouslySetInnerHTML={{ __html: challenge.data.svg }}
            data-testid="captcha-math-svg"
          />
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Solve the equation"
              type="number"
              onKeyDown={e => e.key === "Enter" && handleSubmitAnswer()}
              disabled={isLoading || lockoutSeconds > 0}
              data-testid="input-captcha-math"
            />
            <Button
              onClick={handleSubmitAnswer}
              disabled={isLoading || !answer.trim() || lockoutSeconds > 0}
              data-testid="button-submit-math"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {lockoutSeconds > 0 && (
        <div className="flex items-center justify-center gap-2 p-3 bg-destructive/10 rounded-md" data-testid="captcha-lockout-notice">
          <Clock className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive font-medium">
            {lockoutMessage || "Temporarily locked out."} Try again in {formatLockoutTime(lockoutSeconds)}
          </span>
        </div>
      )}

      {canRegenerate && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating || isLoading}
            data-testid="button-regenerate-captcha"
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Can't read this?
          </Button>
          {regenRemaining !== null && (
            <span className="text-xs text-muted-foreground" data-testid="text-regen-remaining">
              {regenRemaining.toLocaleString()} left
            </span>
          )}
        </div>
      )}

      {error && challenge && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {solveStatus === "success" && (
        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm">Correct!</span>
        </div>
      )}

      {onCancel && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-captcha">
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
