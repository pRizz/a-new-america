import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Shield, Scale, Eye, Lock, Calculator, Cpu, Type, Clock, TrendingUp, AlertTriangle, Users } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-about-title">
          Fairness & Transparency
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Everything about how this app works, explained openly. No hidden systems or secret moderation.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center space-y-2">
          <Scale className="h-6 w-6 mx-auto text-primary" />
          <h3 className="font-medium text-sm">Fair Ranking</h3>
          <p className="text-xs text-muted-foreground">ELO system ensures balanced, competitive rankings</p>
        </Card>
        <Card className="p-4 text-center space-y-2">
          <Eye className="h-6 w-6 mx-auto text-primary" />
          <h3 className="font-medium text-sm">Privacy First</h3>
          <p className="text-xs text-muted-foreground">No location prompts, no IP storage, no tracking</p>
        </Card>
        <Card className="p-4 text-center space-y-2">
          <Shield className="h-6 w-6 mx-auto text-primary" />
          <h3 className="font-medium text-sm">Anti-Spam</h3>
          <p className="text-xs text-muted-foreground">Multi-layer captcha system prevents abuse</p>
        </Card>
      </div>

      <Accordion type="multiple" defaultValue={["elo", "privacy", "captcha", "formulas"]} className="space-y-2">
        <AccordionItem value="elo">
          <AccordionTrigger className="text-base" data-testid="accordion-elo">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              ELO Rating System
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Every name starts with an ELO rating of 1000. When two names are matched up and a user votes,
              the winner gains ELO points and the loser loses points. The amount exchanged depends on the
              expected outcome — upsets cause bigger swings.
            </p>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Two Separate Leaderboards</p>
              <p>
                Each name has <strong>two</strong> independent ELO scores:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>American ELO</strong> — updated only when an American user votes</li>
                <li><strong>Non-American ELO</strong> — updated only when an international user votes</li>
              </ul>
              <p>This lets everyone see how preferences differ between Americans and international voters.</p>
            </div>
            <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
              <p>K-factor = 32</p>
              <p>Expected = 1 / (1 + 10^((loserElo - winnerElo) / 400))</p>
              <p>Delta = K * (1 - Expected)</p>
              <p>Winner: elo += Delta</p>
              <p>Loser: elo -= Delta</p>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="privacy">
          <AccordionTrigger className="text-base" data-testid="accordion-privacy">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Privacy Statement
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What we DO NOT do:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>We do NOT ask for your location</li>
              <li>We do NOT request browser geolocation permission</li>
              <li>We do NOT ask you to select a state</li>
              <li>We do NOT trust client-provided location data</li>
              <li>We do NOT store IP addresses, raw headers, precise coordinates, city, or street address</li>
              <li>We do NOT display your username or email publicly</li>
            </ul>
            <Separator />
            <p className="font-medium text-foreground">American vs Non-American Classification</p>
            <p>
              We use a server-side, privacy-preserving lookup to estimate whether you're in the US.
              Only a coarse result is stored (country code and a boolean). If we're uncertain, we default
              you to Non-American. This classification only affects which ELO leaderboard your votes count toward.
            </p>
            <p>
              "American" means the 50 US states + Washington DC only (no territories).
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="captcha">
          <AccordionTrigger className="text-base" data-testid="accordion-captcha">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Captcha System
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p>All captchas are self-hosted. No Google, no Cloudflare, no external services.</p>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Captcha Engine Types</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Card className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="font-medium text-xs text-foreground">Proof of Work A</span>
                  </div>
                  <p className="text-xs">Your browser solves a computational puzzle automatically</p>
                </Card>
                <Card className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="font-medium text-xs text-foreground">Proof of Work B</span>
                  </div>
                  <p className="text-xs">A different hash-based puzzle solved in your browser</p>
                </Card>
                <Card className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4 text-primary" />
                    <span className="font-medium text-xs text-foreground">SVG Text</span>
                  </div>
                  <p className="text-xs">Read distorted text from an SVG image and type it</p>
                </Card>
                <Card className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    <span className="font-medium text-xs text-foreground">Math Challenge</span>
                  </div>
                  <p className="text-xs">Solve an arithmetic or logic problem</p>
                </Card>
              </div>
            </div>

            <Separator />
            <p className="font-medium text-foreground">Why different amounts?</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Account creation: 4 challenges</strong> — proves you're not a bot before you can even log in
              </li>
              <li>
                <strong>Voting: at least 4 challenges</strong> — increases if you vote frequently (anti-spam debt)
              </li>
              <li>
                <strong>Submitting a name: at least 15 challenges</strong> — heavy verification to prevent spam submissions.
                The global minimum difficulty increases with each successful submission.
              </li>
            </ul>
            <p>Each plan uses a mix of engine types. No plan is all one type.</p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="formulas">
          <AccordionTrigger className="text-base" data-testid="accordion-formulas">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Exact Formulas
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p className="font-medium text-foreground">User Captcha State</p>
              <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
                <p>initialCaptchaDifficulty = 75</p>
                <p>minCaptchaDifficulty = 60</p>
                <p>maxCaptchaDifficulty = 95</p>
                <p>initialCaptchaDebt = 0</p>
              </Card>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">After a Successful Vote</p>
              <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
                <p>captchaDebt += 10</p>
                <p>captchaDifficulty += 1 (capped at 95)</p>
              </Card>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Decay (every 3 days, applied lazily)
              </p>
              <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
                <p>captchaDebt -= 15 (floor 0)</p>
                <p>captchaDifficulty -= 2 (floor 60)</p>
              </Card>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="font-medium text-foreground">Vote Captcha Requirements</p>
              <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
                <p>voteRequiredCount = max(4, 4 + floor(captchaDebt / 30))</p>
                <p>voteDifficulty = clamp(captchaDifficulty + floor(captchaDebt / 25), 0, 100)</p>
              </Card>
              <p className="text-xs">
                The more you vote, the more challenges you need. This decays over time when you take breaks.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Submit Name Captcha Requirements</p>
              <Card className="p-3 bg-muted/50 font-mono text-xs space-y-1">
                <p>globalMinDifficulty starts at 85, +2 per submission (cap 95)</p>
                <p>globalMinCount starts at 15, +1 per 25 submissions (cap 25)</p>
                <p>submitRequiredCount = max(globalMinCount, 15 + floor(captchaDebt / 20))</p>
                <p>submitDifficulty = max(globalMinDifficulty, clamp(captchaDifficulty + floor(captchaDebt / 15), 0, 100))</p>
              </Card>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Rate Limiting
              </p>
              <ul className="list-disc pl-6 space-y-1 text-xs">
                <li>Voting: max 120 votes per user per hour</li>
                <li>Submissions: max 2 per user per day</li>
                <li>Account age minimum: 24 hours before submitting names</li>
                <li>Repeated rate-limit violations increase captcha debt</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Connected Users
              </p>
              <p className="text-xs">
                Users are considered "connected" if they were active in the last 15 minutes.
                Counts are recomputed at most every 10 minutes.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
