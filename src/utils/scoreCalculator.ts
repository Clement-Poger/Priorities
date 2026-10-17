export interface PairScore {
  player1Id: string;
  player2Id: string;
  score: number;
}

export function calculateAffinityScore(rankA: string[], rankB: string[]): number {
  let score = 0;
  rankA.forEach((cardId, indexA) => {
    const indexB = rankB.indexOf(cardId);
    if (indexB !== -1) {
      const distance = Math.abs(indexA - indexB);
      if (distance === 0) {
        score += 2; // Position exacte = 2 points
      } else if (distance === 1) {
        score += 1; // Écart de 1 position = 1 point
      }
    }
  });
  return score;
}