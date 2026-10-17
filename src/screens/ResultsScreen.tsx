import React, { useState } from 'react';
import { RevealScreen } from '../components/RevealScreen';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type { Player, PlayerRanking, Round, RoundGuess } from '../types/database.types';
import { shuffle } from '../utils/shuffle';
import { ensureRoundWithCards } from '../utils/ensureRoundWithCards';

interface Props {
  gameId: string;
  round: Round | null;
  players: Player[];
  rankings: PlayerRanking[];
  guesses: RoundGuess[];
  isHost: boolean;
}

export const ResultsScreen: React.FC<Props> = ({
  gameId,
  round,
  players,
  rankings,
  guesses,
  isHost,
}) => {
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  const handleNextRound = async () => {
    if (!isHost || !round || isStartingNextRound) return;
    setIsStartingNextRound(true);
    setError(null);
    try {
      const { data: availableCards, error: cardsError } = await supabase
        .from('cards')
        .select('id');
      if (cardsError) throw cardsError;
      if (availableCards.length < 5) {
        throw new Error('Pas assez de cartes disponibles pour lancer un nouveau round.');
      }

      const nextRoundNumber = round.round_index + 1;
      const cardIds = shuffle(availableCards).slice(0, 5).map((card) => card.id);
      await ensureRoundWithCards(gameId, nextRoundNumber, cardIds);

      const { data: updatedGame, error: gameError } = await supabase
        .from('games')
        .update({ status: 'RANKING', round_number: nextRoundNumber })
        .eq('id', gameId)
        .eq('status', 'RESULTS')
        .select('id')
        .maybeSingle();
      if (gameError) throw gameError;
      if (!updatedGame) throw new Error('Le round suivant n’a pas pu être démarré.');
      haptics.success();
    } catch (nextRoundError) {
      console.error('Erreur démarrage du round suivant:', nextRoundError);
      setError(
        nextRoundError instanceof Error
          ? nextRoundError.message
          : 'Impossible de démarrer le round suivant.'
      );
      haptics.error();
    } finally {
      setIsStartingNextRound(false);
    }
  };

  return (
    <RevealScreen
      players={players}
      rankings={rankings}
      guesses={guesses}
      isHost={isHost}
      isStartingNextRound={isStartingNextRound}
      onNextRound={() => void handleNextRound()}
      error={error}
    />
  );
};
