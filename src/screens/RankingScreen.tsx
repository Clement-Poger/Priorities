import React, { useEffect, useState } from 'react';
import { DragAndDropRanker } from '../components/DragAndDropRanker';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { CheckCircle2 } from 'lucide-react';
import type { Card, Player, PlayerRanking, Round } from '../types/database.types';
import { loadRoundCards } from '../utils/loadRoundCards';

interface RankingScreenProps {
  round: Round | null;
  playerId: string;
  players: Player[];
  rankings: PlayerRanking[];
  submittedCount: number;
  rankingStartedAt: string | null;
  rankingTimerSeconds: number;
}

export const RankingScreen: React.FC<RankingScreenProps> = ({
  round,
  playerId,
  players,
  rankings,
  submittedCount,
  rankingStartedAt,
  rankingTimerSeconds,
}) => {
  const [cards, setCards] = useState<Array<Pick<Card, 'id' | 'content'>>>([]);
  const [loading, setLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const haptics = useHaptics();

  useEffect(() => {
    let active = true;
    const fetchCards = async () => {
      setLoading(true);
      setLoadError(null);
      if (!round?.id) {
        setCards([]);
        setLoadError('Aucun round actif n’a été trouvé.');
        setLoading(false);
        return;
      }

      try {
        const ordered = await loadRoundCards(round.id);
        if (active) {
          setCards(ordered);
        }
      } catch (error) {
        console.error('Erreur chargement des cartes:', error);
        if (active) {
          setCards([]);
          setLoadError(
            error instanceof Error ? error.message : 'Impossible de charger les cartes.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchCards();
    return () => {
      active = false;
    };
  }, [round?.id]);

  useEffect(() => {
    const currentRanking = rankings.find((r) => r.player_id === playerId);
    setHasSubmitted(Boolean(currentRanking?.is_submitted));
  }, [rankings, playerId]);

  const handleSubmitRanking = async (rankedIds: string[]) => {
    if (isSubmitting || !round?.id) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      haptics.mediumTap();

      const { error } = await supabase.from('player_rankings').upsert(
        [
          {
            round_id: round.id,
            player_id: playerId,
            ranking: rankedIds,
            is_submitted: true,
          },
        ],
        { onConflict: 'round_id,player_id' }
      );
      if (error) throw error;

      setHasSubmitted(true);
      haptics.success();
    } catch (err) {
      console.error('Erreur soumission classement:', err);
      const errorMessage =
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof err.message === 'string'
          ? err.message
          : 'Impossible d’enregistrer le classement.';
      setSubmitError(errorMessage);
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="ranking-loading flex flex-col items-center justify-center h-full text-slate-400">
        <div className="loading-spinner" />
        <p className="text-xs font-medium">Chargement des cartes...</p>
      </div>
    );
  }

  if (loadError) {
    return <div className="state-card" role="alert">{loadError}</div>;
  }

  if (hasSubmitted) {
    return (
      <div className="ranking-submitted flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 text-center space-y-4">
        <div className="submitted-icon p-4 bg-emerald-100 text-emerald-600 rounded-full animate-bounce">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">Classement verrouillé !</h2>
        <p className="text-sm text-slate-500">
          En attente des autres joueurs avant la phase de devinette...
        </p>

        <div className="submitted-progress bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-700">
          {submittedCount} / {players.length} joueurs prêts
        </div>
        {submitError && <p className="inline-error" role="alert">{submitError}</p>}
      </div>
    );
  }

  return (
    <DragAndDropRanker
      cards={cards}
      onSubmitRanking={handleSubmitRanking}
      isSubmitting={isSubmitting}
      error={submitError}
      timerExpiresAt={
        rankingStartedAt && rankingTimerSeconds > 0
          ? new Date(rankingStartedAt).getTime() + rankingTimerSeconds * 1000
          : null
      }
      timerDurationSeconds={rankingTimerSeconds}
    />
  );
};