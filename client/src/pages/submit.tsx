import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CaptchaChallenge } from "@/components/captcha-challenge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { submitNameSchema } from "@shared/schema";
import { SignInButton } from "@clerk/clerk-react";
import { PlusCircle, ShieldCheck, AlertTriangle, Clock, Info, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { z } from "zod";

interface SubmitCaptchaInfo {
  submitRequiredCount: number;
  submitDifficulty: number;
  captchaDifficulty: number;
  captchaDebt: number;
  canSubmit: boolean;
  reason?: string;
  accountAgeHours?: number;
}

export default function SubmitPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"form" | "captcha" | "success">("form");
  const [nameText, setNameText] = useState("");

  const form = useForm<z.infer<typeof submitNameSchema>>({
    resolver: zodResolver(submitNameSchema),
    defaultValues: { text: "" },
  });

  const { data: submitInfo } = useQuery<SubmitCaptchaInfo>({
    queryKey: ["/api/user/submit-info"],
    enabled: isAuthenticated,
    staleTime: 10000,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { text: string; captchaPlanId: string }) => {
      const res = await apiRequest("POST", "/api/names/submit", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/submit-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/captcha-info"] });
      toast({ title: "Name submitted!", description: `"${data.name}" has been added to the ballot.` });
      setStep("success");
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
      setStep("form");
    },
  });

  function handleFormSubmit(values: z.infer<typeof submitNameSchema>) {
    setNameText(values.text);
    setStep("captcha");
  }

  function handleCaptchaComplete(planId: string) {
    submitMutation.mutate({ text: nameText, captchaPlanId: planId });
  }

  if (step === "success") {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
        <h2 className="text-xl font-semibold">Name Submitted!</h2>
        <p className="text-muted-foreground text-sm">Your proposed name has been added and is now available for voting.</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link href="/">
            <Button data-testid="button-back-to-vote">Back to Voting</Button>
          </Link>
          <Button variant="outline" onClick={() => { setStep("form"); form.reset(); }} data-testid="button-submit-another">
            Submit Another
          </Button>
        </div>
      </div>
    );
  }

  if (step === "captcha") {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <ShieldCheck className="h-8 w-8 mx-auto text-primary mb-2" />
          <h2 className="text-xl font-semibold">Security Verification</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Submitting a new name requires {(submitInfo?.submitRequiredCount || 15).toLocaleString()} security challenges
          </p>
        </div>
        <CaptchaChallenge
          planType="submit"
          onComplete={handleCaptchaComplete}
          onCancel={() => setStep("form")}
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-submit-title">
          Submit a Name
        </h1>
        <p className="text-muted-foreground text-sm">
          Propose a new name for the United States. Heavy anti-spam verification required.
        </p>
      </div>

      {!isAuthenticated ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Info className="h-8 w-8 text-primary" />
            <h3 className="font-medium">Account Required</h3>
            <p className="text-sm text-muted-foreground">
              You need to sign in to submit names. Each submission requires security verification.
            </p>
            <SignInButton mode="modal">
              <Button data-testid="button-create-account-submit">
                Sign In
              </Button>
            </SignInButton>
          </div>
        </Card>
      ) : submitInfo && !submitInfo.canSubmit ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Cannot Submit</p>
              <p className="text-sm text-muted-foreground">{submitInfo.reason}</p>
              {submitInfo.accountAgeHours !== undefined && submitInfo.accountAgeHours < 24 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                  <Clock className="h-3 w-3" />
                  <span>Account age: {submitInfo.accountAgeHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hours (need 24h)</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proposed Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g. "The United Peoples of America"'
                          maxLength={60}
                          {...field}
                          data-testid="input-submit-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Requirements: 3-60 characters, must contain letters, no hate speech</p>
                  {submitInfo && (
                    <p>You'll need to complete {submitInfo.submitRequiredCount.toLocaleString()} captcha challenges at difficulty {submitInfo.submitDifficulty.toLocaleString()}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" data-testid="button-continue-submit">
                  <PlusCircle className="h-4 w-4" />
                  Continue to Verification
                </Button>
              </form>
            </Form>
          </Card>

          {submitInfo && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-sm text-foreground">Submission Requirements</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span>Challenges required:</span>
                    <span className="font-mono">{submitInfo.submitRequiredCount.toLocaleString()}</span>
                    <span>Difficulty level:</span>
                    <span className="font-mono">{submitInfo.submitDifficulty.toLocaleString()}</span>
                    <span>Your captcha debt:</span>
                    <span className="font-mono">{submitInfo.captchaDebt.toLocaleString()}</span>
                    <span>Your base difficulty:</span>
                    <span className="font-mono">{submitInfo.captchaDifficulty.toLocaleString()}</span>
                  </div>
                  <Link href="/about" className="text-primary inline-flex items-center gap-1 mt-1">
                    Why so many? <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
