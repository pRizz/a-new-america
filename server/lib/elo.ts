const K_FACTOR = 32;

export function calculateElo(winnerElo: number, loserElo: number): { winnerNew: number; loserNew: number; delta: number } {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const delta = K_FACTOR * (1 - expected);
  return {
    winnerNew: winnerElo + delta,
    loserNew: loserElo - delta,
    delta,
  };
}
