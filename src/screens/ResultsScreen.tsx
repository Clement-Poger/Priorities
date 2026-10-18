import React, { useState } from 'react';
import { RevealScreen } from '../components/RevealScreen';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type { Player, Round, RoundGuess } from '../types/database.types';
import { shuffle } from '../utils/shuffle';
import { ensureRoundWithCards } from '../utils/ensureRoundWithCards';

interface Props {
  gameId: string;
  round: Round | null;
  players: Player[];
  guesses: RoundGuess[];
  isHost: boolean;
  roundLimit: number;
  cardCount: number;
}

export const ResultsScreen: React.FC<Props> = ({
  gameId,
  round,
  players,
  guesses,
  isHost,
  roundLimit,
  cardCount,
}) => {
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);
  const [isReturningToLobby, setIsReturningToLobby] = useState(false);
  const [isFinishingGame, setIsFinishingGame] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  const handleNextRound = async () => {
    if (!isHost || !round || round.round_index >= roundLimit || isStartingNextRound || isReturningToLobby || isFinishingGame) return;
    setIsStartingNextRound(true);
    setError(null);
    try {
      const { data: availableCards, error: cardsError } = await supabase
        .from('cards')
        .select('id');
      if (cardsError) throw cardsError;
      if (availableCards.length < cardCount) {
        throw new Error(`Pas assez de cartes disponibles pour lancer un nouveau round (il en faut ${cardCount}).`);
      }

      const nextRoundNumber = round.round_index + 1;
      const cardIds = shuffle(availableCards).slice(0, cardCount).map((card) => card.id);
      await ensureRoundWithCards(gameId, nextRoundNumber, cardIds, cardCount);

      const { data: updatedGame, error: gameError } = await supabase
        .from('games')
        .update({
          status: 'RANKING',
          round_number: nextRoundNumber,
        })
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

  const handleReturnToLobby = async () => {
    if (!isHost || isReturningToLobby || isStartingNextRound || isFinishingGame) return;
    setIsReturningToLobby(true);
    setError(null);
    try {
      const { data, error: gameError } = await supabase
        .from('games')
        .update({ status: 'LOBBY' })
        .eq('id', gameId)
        .eq('status', 'RESULTS')
        .select('id')
        .maybeSingle();
      if (gameError) throw gameError;
      if (!data) throw new Error('Le retour au lobby n’a pas pu être effectué.');
      haptics.success();
    } catch (lobbyError) {
      console.error('Erreur retour au lobby:', lobbyError);
      setError(
        lobbyError instanceof Error
          ? lobbyError.message
          : 'Impossible de retourner au lobby.'
      );
      haptics.error();
    } finally {
      setIsReturningToLobby(false);
    }
  };

  const handleFinishGame = async () => {
    if (!isHost || !round || round.round_index < roundLimit || isFinishingGame || isStartingNextRound || isReturningToLobby) return;
    setIsFinishingGame(true);
    setError(null);
    try {
      const { data, error: gameError } = await supabase
        .from('games')
        .update({ status: 'FINISHED' })
        .eq('id', gameId)
        .eq('status', 'RESULTS')
        .select('id')
        .maybeSingle();
      if (gameError) throw gameError;
      if (!data) throw new Error('La partie n’a pas pu être terminée.');
      haptics.success();
    } catch (finishError) {
      console.error('Erreur fin de partie:', finishError);
      setError(
        finishError instanceof Error
          ? finishError.message
          : 'Impossible de terminer la partie.'
      );
      haptics.error();
    } finally {
      setIsFinishingGame(false);
    }
  };

  return (
    <RevealScreen
      players={players}
      guesses={guesses}
      isHost={isHost}
      isStartingNextRound={isStartingNextRound}
      isReturningToLobby={isReturningToLobby}
      isFinishingGame={isFinishingGame}
      isLastRound={Boolean(round && round.round_index >= roundLimit)}
      onNextRound={() => void handleNextRound()}
      onReturnToLobby={() => void handleReturnToLobby()}
      onFinishGame={() => void handleFinishGame()}
      error={error}
    />
  );
};
