import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  Game,
  Player,
  PlayerRanking,
  Round,
  RoundGuess,
  RoundReveal,
  RoundRevealOrder,
} from '../types/database.types';

export function useGameSync(gameId: string, playerId: string) {
  const [gameState, setGameState] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [roundReveal, setRoundReveal] = useState<RoundReveal | null>(null);
  const [roundGuess, setRoundGuess] = useState<RoundGuess | null>(null);
  const [roundGuesses, setRoundGuesses] = useState<RoundGuess[]>([]);
  const [revealOrder, setRevealOrder] = useState<RoundRevealOrder[]>([]);
  const [roundProgress, setRoundProgress] = useState({ submittedCount: 0, guessedCount: 0 });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentRoundRef = useRef<Round | null>(null);
  const requestSequence = useRef(0);
  const refreshInProgress = useRef(false);
  const refreshPending = useRef(false);
  currentRoundRef.current = currentRound;

  const refresh = useCallback(async () => {
    if (!gameId) return;
    if (refreshInProgress.current) {
      refreshPending.current = true;
      return;
    }

    refreshInProgress.current = true;
    try {
      do {
        refreshPending.current = false;
        const requestId = ++requestSequence.current;

        try {
          const [gameResult, playersResult, roundsResult] = await Promise.all([
            supabase.from('games').select('*').eq('id', gameId).single(),
            supabase.from('players').select('*').eq('game_id', gameId),
            supabase
              .from('rounds')
              .select('*')
              .eq('game_id', gameId)
              .order('round_index', { ascending: false })
              .limit(1),
          ]);

          if (gameResult.error) throw gameResult.error;
          if (playersResult.error) throw playersResult.error;
          if (roundsResult.error) throw roundsResult.error;

          const latestRound = roundsResult.data[0] ?? null;
          let latestRankings: PlayerRanking[] = [];
          let latestRoundReveal: RoundReveal | null = null;
          let latestRoundGuess: RoundGuess | null = null;
          let latestRoundGuesses: RoundGuess[] = [];
          let latestRevealOrder: RoundRevealOrder[] = [];
          let latestRoundProgress = { submittedCount: 0, guessedCount: 0 };
          if (latestRound) {
            const [
              rankingsResult,
              revealResult,
              guessResult,
              revealOrderResult,
              progressResult,
            ] = await Promise.all([
              supabase
                .from('player_rankings')
                .select('*')
                .eq('round_id', latestRound.id),
              supabase
                .from('round_reveals')
                .select('*')
                .eq('round_id', latestRound.id)
                .maybeSingle(),
              supabase
                .from('round_guesses')
                .select('*')
                .eq('round_id', latestRound.id),
              supabase
                .from('round_reveal_order')
                .select('*')
                .eq('round_id', latestRound.id)
                .order('reveal_index', { ascending: true }),
              supabase.rpc('get_round_progress', { p_round_id: latestRound.id }),
            ]);
            if (rankingsResult.error) throw rankingsResult.error;
            if (revealResult.error) throw revealResult.error;
            if (guessResult.error) throw guessResult.error;
            if (revealOrderResult.error) throw revealOrderResult.error;
            if (progressResult.error) throw progressResult.error;
            latestRankings = rankingsResult.data;
            latestRoundReveal = revealResult.data;
            latestRoundGuesses = guessResult.data;
            latestRoundGuess = latestRoundGuesses.find(
              (guess) => guess.guesser_player_id === playerId
            ) ?? null;
            latestRevealOrder = revealOrderResult.data;
            latestRoundProgress = {
              submittedCount: progressResult.data.submitted_count,
              guessedCount: progressResult.data.guessed_count,
            };
          }

          if (requestId !== requestSequence.current) continue;
          setGameState(gameResult.data);
          setPlayers(playersResult.data);
          setCurrentRound(latestRound);
          setRankings(latestRankings);
          setRoundReveal(latestRoundReveal);
          setRoundGuess(latestRoundGuess);
          setRoundGuesses(latestRoundGuesses);
          setRevealOrder(latestRevealOrder);
          setRoundProgress(latestRoundProgress);
          setSyncError(null);
        } catch (error) {
          if (requestId !== requestSequence.current) continue;
          console.error('Erreur synchronisation partie:', error);
          setSyncError(
            error instanceof Error ? error.message : 'Impossible de synchroniser la partie.'
          );
        } finally {
          if (requestId === requestSequence.current) setIsLoading(false);
        }
      } while (refreshPending.current);
    } finally {
      refreshInProgress.current = false;
    }
  }, [gameId, playerId]);

  useEffect(() => {
    if (!gameId) return;

    void refresh();

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameId}` },
        () => void refresh()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rankings' }, (payload) => {
        const changedRoundId =
          'round_id' in payload.new
            ? payload.new.round_id
            : 'round_id' in payload.old
              ? payload.old.round_id
              : null;
        if (changedRoundId && changedRoundId === currentRoundRef.current?.id) {
          void refresh();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_reveals' }, (payload) => {
        const changedRoundId =
          'round_id' in payload.new
            ? payload.new.round_id
            : 'round_id' in payload.old
              ? payload.old.round_id
              : null;
        if (changedRoundId && changedRoundId === currentRoundRef.current?.id) {
          void refresh();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_guesses' }, (payload) => {
        const changedRoundId =
          'round_id' in payload.new
            ? payload.new.round_id
            : 'round_id' in payload.old
              ? payload.old.round_id
              : null;
        if (changedRoundId && changedRoundId === currentRoundRef.current?.id) {
          void refresh();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_reveal_order' }, (payload) => {
        const changedRoundId =
          'round_id' in payload.new
            ? payload.new.round_id
            : 'round_id' in payload.old
              ? payload.old.round_id
              : null;
        if (changedRoundId && changedRoundId === currentRoundRef.current?.id) {
          void refresh();
        }
      })
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          void refresh();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erreur abonnement temps réel:', error);
          setSyncError(error?.message ?? 'La connexion temps réel a échoué.');
        }
      });

    return () => {
      requestSequence.current++;
      void supabase.removeChannel(channel);
    };
  }, [gameId, refresh]);

  useEffect(() => {
    if (!gameId || gameState?.status !== 'LOBBY') return;

    const refreshLobby = () => void refresh();
    const intervalId = window.setInterval(refreshLobby, 1500);
    window.addEventListener('focus', refreshLobby);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshLobby);
    };
  }, [gameId, gameState?.status, refresh]);

  return {
    gameState,
    players,
    currentRound,
    rankings,
    roundReveal,
    roundGuess,
    roundGuesses,
    revealOrder,
    roundProgress,
    syncError,
    isLoading,
    refresh,
  };
}
