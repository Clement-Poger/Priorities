import React, { useState } from 'react';
import { GameLobby } from '../components/GameLobby';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type { Player } from '../types/database.types';
import { shuffle } from '../utils/shuffle';
import { ensureRoundWithCards } from '../utils/ensureRoundWithCards';

interface LobbyScreenProps {
  gameId: string;
  gameCode: string;
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  onRefresh: () => Promise<void>;
  onLobbyClosed: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  gameId,
  gameCode,
  players,
  currentPlayerId,
  isHost,
  onRefresh,
  onLobbyClosed,
}) => {
  const haptics = useHaptics();
  const [isStarting, setIsStarting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleStartGame = async () => {
    if (isStarting || isClosing || players.length < 2) return;
    setIsStarting(true);
    setStartError(null);
    haptics.mediumTap();

    try {
      const { data: cards, error: cardsError } = await supabase.from('cards').select('id');
      if (cardsError) throw cardsError;
      if (!cards || cards.length < 5) {
        throw new Error('Pas assez de cartes disponibles pour démarrer la partie.');
      }

      const selectedCardIds = shuffle(cards).slice(0, 5).map((card) => card.id);
      await ensureRoundWithCards(gameId, 1, selectedCardIds);

      const { data: startedGame, error: gameError } = await supabase
        .from('games')
        .update({ status: 'RANKING', round_number: 1 })
        .eq('id', gameId)
        .eq('status', 'LOBBY')
        .select('id')
        .maybeSingle();
      if (gameError) throw gameError;
      if (!startedGame) {
        throw new Error('La partie n’a pas pu démarrer. Elle est peut-être déjà fermée ou démarrée.');
      }

      await onRefresh();
      haptics.success();
    } catch (error) {
      console.error('Erreur démarrage partie:', error);
      setStartError(
        error instanceof Error ? error.message : 'Impossible de démarrer la partie.'
      );
      haptics.error();
    } finally {
      setIsStarting(false);
    }
  };

  const handleCloseLobby = async () => {
    if (!isHost || isStarting || isClosing) return;

    setIsClosing(true);
    setCloseError(null);
    try {
      const { data, error } = await supabase
        .from('games')
        .update({ status: 'FINISHED' })
        .eq('id', gameId)
        .eq('status', 'LOBBY')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Ce salon a déjà été fermé ou la partie a démarré.');
      haptics.success();
      onLobbyClosed();
    } catch (error) {
      console.error('Erreur fermeture du salon:', error);
      setCloseError(
        error instanceof Error ? error.message : 'Impossible de fermer le salon.'
      );
      haptics.error();
    } finally {
      setIsClosing(false);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      haptics.lightTap();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <GameLobby
      code={gameCode}
      players={players}
      currentPlayerId={currentPlayerId}
      isHost={isHost}
      onStartGame={handleStartGame}
      onCloseLobby={handleCloseLobby}
      isStarting={isStarting}
      isClosing={isClosing}
      startError={startError}
      closeError={closeError}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    />
  );
};