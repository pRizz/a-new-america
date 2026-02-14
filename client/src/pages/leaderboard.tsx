import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Name } from "@shared/schema";
import { ArrowUpDown, ArrowUp, ArrowDown, Trophy, Medal, Award } from "lucide-react";

type SortField = "eloAmerican" | "eloNonAmerican" | "voteCountTotal" | "voteCountAmerican" | "voteCountNonAmerican" | "createdAt";
type SortDir = "asc" | "desc";

export default function LeaderboardPage() {
  const [sortField, setSortField] = useState<SortField>("eloAmerican");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: names, isLoading } = useQuery<Name[]>({
    queryKey: ["/api/names"],
    staleTime: 15000,
  });

  const sorted = names ? [...names].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (sortField === "createdAt") {
      const aDate = new Date(aVal as string).getTime();
      const bDate = new Date(bVal as string).getTime();
      return sortDir === "asc" ? aDate - bDate : bDate - aDate;
    }
    return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  }) : [];

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  const rankIcons = [Trophy, Medal, Award];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-leaderboard-title">
          Leaderboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Rankings of all proposed names, with separate ELO scores for American and International voters.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("eloAmerican")}
                    data-testid="button-sort-elo-american"
                  >
                    US ELO <SortIcon field="eloAmerican" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("eloNonAmerican")}
                    data-testid="button-sort-elo-nonus"
                  >
                    Intl ELO <SortIcon field="eloNonAmerican" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("voteCountTotal")}
                    data-testid="button-sort-total-votes"
                  >
                    Total <SortIcon field="voteCountTotal" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("voteCountAmerican")}
                    data-testid="button-sort-us-votes"
                  >
                    US Votes <SortIcon field="voteCountAmerican" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("voteCountNonAmerican")}
                    data-testid="button-sort-intl-votes"
                  >
                    Intl Votes <SortIcon field="voteCountNonAmerican" />
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="no-default-hover-elevate no-default-active-elevate -ml-3"
                    onClick={() => toggleSort("createdAt")}
                    data-testid="button-sort-created"
                  >
                    Created <SortIcon field="createdAt" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No names submitted yet. Be the first!
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((name, idx) => {
                  const RankIcon = idx < 3 ? rankIcons[idx] : null;
                  const rankColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];
                  return (
                    <TableRow key={name.id} data-testid={`row-name-${name.id}`}>
                      <TableCell className="text-center">
                        {RankIcon ? (
                          <RankIcon className={`h-4 w-4 mx-auto ${rankColors[idx]}`} />
                        ) : (
                          <span className="text-muted-foreground text-sm">{(idx + 1).toLocaleString()}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-leaderboard-name-${name.id}`}>
                        {name.text}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{Math.round(name.eloAmerican).toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{Math.round(name.eloNonAmerican).toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {name.voteCountTotal.toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        {name.voteCountAmerican.toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        {name.voteCountNonAmerican.toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {name.createdAt ? new Date(name.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
