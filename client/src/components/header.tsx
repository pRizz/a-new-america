import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { Sun, Moon, Menu, X, Vote, Trophy, PlusCircle, Info, Flag, User } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: stats } = useQuery<{
    totalVotes: number;
    connectedAmericans: number;
    connectedNonAmericans: number;
  }>({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  const navItems = [
    { path: "/", label: "Vote", icon: Vote },
    { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { path: "/submit", label: "Submit", icon: PlusCircle },
    { path: "/about", label: "About", icon: Info },
    ...(isAuthenticated ? [{ path: "/account", label: "Account", icon: User }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 h-14">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <Flag className="h-5 w-5 text-primary" />
              <span className="font-bold text-base text-foreground whitespace-nowrap" data-testid="text-app-title">A New America</span>
            </Link>

            {stats && (
              <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                <span data-testid="text-total-votes">{stats.totalVotes.toLocaleString()} votes</span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1" data-testid="text-connected-americans">
                  <span className="relative flex h-2 w-2">
                    {stats.connectedAmericans > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.connectedAmericans > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  </span>
                  {stats.connectedAmericans.toLocaleString()} US
                </span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1" data-testid="text-connected-non-americans">
                  <span className="relative flex h-2 w-2">
                    {stats.connectedNonAmericans > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.connectedNonAmericans > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  </span>
                  {stats.connectedNonAmericans.toLocaleString()} Intl
                </span>
              </div>
            )}
          </div>

          <nav className="hidden md:flex items-center gap-1" data-testid="nav-desktop">
            {navItems.map(item => (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={location === item.path ? "secondary" : "ghost"}
                  size="sm"
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {isAuthenticated ? (
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            ) : (
              <SignInButton mode="modal">
                <Button size="sm" data-testid="button-sign-in">
                  Sign In
                </Button>
              </SignInButton>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-3 border-t" data-testid="nav-mobile">
            {stats && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground py-2">
                <span>{stats.totalVotes.toLocaleString()} votes</span>
                <span className="text-border">|</span>
                <span>{stats.connectedAmericans.toLocaleString()} US connected</span>
                <span className="text-border">|</span>
                <span>{stats.connectedNonAmericans.toLocaleString()} Intl connected</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {navItems.map(item => (
                <Link key={item.path} href={item.path} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={location === item.path ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    data-testid={`link-nav-mobile-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
