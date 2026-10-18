import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type {
  Card,
  Player,
  PlayerRanking,
  Round,
  RoundAffinityProgress,
  RoundAffinityReveal,
  RoundReveal,
  RoundRevealOrder,
  RankingRevealMode,
} from '../types/database.types';
import { loadRoundCards } from '../utils/loadRoundCards';

interface Props {
  round: Round | null;
  players: Player[];
  rankings: PlayerRanking[];
  roundReveal: RoundReveal | null;
  revealOrder: RoundRevealOrder[];
  rankingRevealMode: RankingRevealMode;
  playerId: string;
  isHost: boolean;
}

function parseProgress(value: unknown): RoundAffinityProgress {
  if (
    typeof value !== 'object'
    || value === null
    || !('player_revealed_count' in value)
    || !('pairs_per_player' in value)
    || !('all_players_complete' in value)
    || typeof value.player_revealed_count !== 'number'
    || typeof value.pairs_per_player !== 'number'
    || typeof value.all_players_complete !== 'boolean'
  ) {
    throw new Error('La progression des compatibilités est invalide.');
  }

  return {
    player_revealed_count: value.player_revealed_count,
    pairs_per_player: value.pairs_per_player,
    all_players_complete: value.all_players_complete,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export const ItemRevealScreen: React.FC<Props> = ({
  round,
  players,
  rankings,
  roundReveal,
  revealOrder,
  rankingRevealMode,
  playerId,
  isHost,
}) => {
  const [cards, setCards] = useState<Array<Pick<Card, 'id' | 'content'>>>([]);
  const [reveals, setReveals] = useState<RoundAffinityReveal[]>([]);
  const [progress, setProgress] = useState<RoundAffinityProgress | null>(null);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [isLoadingAffinity, setIsLoadingAffinity] = useState(false);
  const [showCompatibility, setShowCompatibility] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  const loadCards = useCallback(async () => {
    if (!round) throw new Error('Aucun round actif n’a été trouvé.');
    return loadRoundCards(round.id);
  }, [round]);

  const loadProgress = useCallback(async () => {
    if (!round) throw new Error('Aucun round actif n’a été trouvé.');
    const { data, error: progressError } = await supabase.rpc(
      'get_round_affinity_progress',
      { p_round_id: round.id }
    );
    if (progressError) throw progressError;
    setProgress(parseProgress(data));
  }, [round]);

  const loadReveals = useCallback(async () => {
    if (!round) throw new Error('Aucun round actif n’a été trouvé.');
    const { data, error: revealsError } = await supabase
      .from('round_affinity_reveals')
      .select('round_id, player_id, target_player_id, reveal_index, compatibility_percentage')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .not('compatibility_percentage', 'is', null)
      .order('reveal_index', { ascending: true });
    if (revealsError) throw revealsError;
    setReveals(data);
  }, [playerId, round]);

  const loadAffinityData = useCallback(async () => {
    setIsLoadingAffinity(true);
    setError(null);
    try {
      await Promise.all([loadProgress(), loadReveals()]);
    } catch (affinityError) {
      console.error('Erreur chargement des compatibilités:', affinityError);
      setError(getErrorMessage(affinityError, 'Impossible de charger les compatibilités.'));
    } finally {
      setIsLoadingAffinity(false);
    }
  }, [loadProgress, loadReveals]);

  useEffect(() => {
    let active = true;
    setIsLoadingCards(true);
    setError(null);
    void loadCards()
      .then((loadedCards) => {
        if (active) setCards(loadedCards);
      })
      .catch((loadError: unknown) => {
        console.error('Erreur chargement des classements à révéler:', loadError);
        if (active) {
          setError(getErrorMessage(loadError, 'Impossible de charger les classements.'));
        }
      })
      .finally(() => {
        if (active) setIsLoadingCards(false);
      });
    return () => {
      active = false;
    };
  }, [loadCards]);

  const handleShowCompatibility = () => {
    setShowCompatibility(true);
    void loadAffinityData();
  };

  const handleRevealNextRanking = async () => {
    if (!round || !isHost || !roundReveal || isAdvancing) return;
    setIsAdvancing(true);
    setError(null);
    try {
      const { error: revealError } = await supabase.rpc('advance_round_reveal', {
        p_round_id: round.id,
        p_player_id: playerId,
      });
      if (revealError) throw revealError;
      haptics.mediumTap();
    } catch (revealError) {
      console.error('Erreur révélation du classement suivant:', revealError);
      setError(getErrorMessage(revealError, 'Impossible de révéler le classement suivant.'));
      haptics.error();
    } finally {
      setIsAdvancing(false);
    }
  };

  useEffect(() => {
    if (!showCompatibility) return;
    const intervalId = window.setInterval(() => {
      void loadProgress().catch((progressError: unknown) => {
        console.error('Erreur actualisation de la progression des compatibilités:', progressError);
        setError(getErrorMessage(
          progressError,
          'Impossible d’actualiser la progression des compatibilités.'
        ));
      });
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [loadProgress, showCompatibility]);

  const handleRevealNext = async () => {
    if (!round || isAdvancing || !progress || progress.player_revealed_count >= progress.pairs_per_player) return;
    setIsAdvancing(true);
    setError(null);
    try {
      const { error: revealError } = await supabase.rpc('advance_round_affinity_reveal', {
        p_round_id: round.id,
        p_player_id: playerId,
      });
      if (revealError) throw revealError;
      await Promise.all([loadProgress(), loadReveals()]);
      haptics.mediumTap();
    } catch (revealError) {
      console.error('Erreur reveal de compatibilité:', revealError);
      setError(getErrorMessage(revealError, 'Impossible de révéler la compatibilité suivante.'));
      haptics.error();
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleFinishReveal = async () => {
    if (!round || !isHost || isAdvancing || !progress?.all_players_complete) return;
    setIsAdvancing(true);
    setError(null);
    try {
      const { error: finishError } = await supabase.rpc('finish_round_reveal', {
        p_round_id: round.id,
        p_player_id: playerId,
      });
      if (finishError) throw finishError;
      haptics.success();
    } catch (finishError) {
      console.error('Erreur fin du reveal:', finishError);
      setError(getErrorMessage(finishError, 'Impossible de terminer la révélation.'));
      haptics.error();
    } finally {
      setIsAdvancing(false);
    }
  };

  if (isLoadingCards) {
    return (
      <section className="order-reveal-screen reveal-loading">
        <div className="loading-spinner" />
        <p>Préparation des classements...</p>
      </section>
    );
  }

  if (!round) {
    return (
      <section className="order-reveal-screen">
        <p className="state-card" role="alert">
          Aucun round actif n’a été trouvé.
        </p>
      </section>
    );
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const rankingCards = players.flatMap((player) => {
    const ranking = rankings.find((entry) => entry.player_id === player.id);
    if (!ranking) return [];
    const orderedCards = ranking.ranking.flatMap((cardId) => {
      const card = cardsById.get(cardId);
      return card ? [card] : [];
    });
    if (orderedCards.length !== ranking.ranking.length) return [];
    return [{
      player,
      orderedCards,
    }];
  });
  const playerHasFinished = progress !== null
    && progress.player_revealed_count >= progress.pairs_per_player;
  const revealedRankingCount = roundReveal?.revealed_count ?? 0;
  const visibleRankingPlayerIds = rankingRevealMode === 'ALL'
    ? null
    : new Set(
      revealOrder
        .filter((entry) => entry.reveal_index <= revealedRankingCount)
        .map((entry) => entry.player_id)
    );
  const visibleRankingCards = visibleRankingPlayerIds
    ? rankingCards.filter(({ player }) => visibleRankingPlayerIds.has(player.id))
    : rankingCards;
  const allRankingsRevealed = rankingRevealMode === 'ALL'
    || revealedRankingCount >= players.length;

  if (!showCompatibility) {
    return (
      <section className="order-reveal-screen">
        <header className="order-reveal-heading">
          <span className="screen-kicker">Fin du round</span>
          <h1>Les classements</h1>
          <p>
            {rankingRevealMode === 'ALL'
              ? 'Voici les classements proposés par chaque joueur.'
              : 'Les classements se dévoilent un par un.'}
          </p>
        </header>

        {rankingRevealMode === 'ONE_BY_ONE' && (
          <div className="reveal-progress">
            <div className="reveal-progress-track">
              <span
                className="reveal-progress-value"
                style={{ width: `${players.length ? (revealedRankingCount / players.length) * 100 : 0}%` }}
              />
            </div>
            <span>{Math.min(revealedRankingCount, players.length)} / {players.length} classements révélés</span>
          </div>
        )}

        {rankingRevealMode === 'ALL' && rankingCards.length !== players.length && (
          <p className="state-card" role="alert">
            {error ?? 'Les classements ne sont pas tous disponibles. Vérifiez que le schéma Supabase est à jour.'}
          </p>
        )}

        <div className="order-reveal-list ranking-reveal-menu" aria-label="Classements des joueurs">
          {visibleRankingCards.map(({ player, orderedCards }) => (
            <article className="order-reveal-card" key={player.id}>
              <h2>{player.nickname}</h2>
              <ol>
                {orderedCards.map((card, index) => (
                  <li key={card.id}>
                    <span>{index + 1}</span>
                    <span>{card.content}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>

        {rankingRevealMode === 'ONE_BY_ONE' && !allRankingsRevealed && (
          isHost ? (
            <button
              className="theme-primary-button"
              onClick={() => void handleRevealNextRanking()}
              disabled={isAdvancing || !roundReveal}
            >
              <Eye aria-hidden="true" />
              {isAdvancing ? 'Révélation...' : 'Révéler le classement suivant'}
            </button>
          ) : (
            <div className="reveal-waiting">
              <EyeOff aria-hidden="true" />
              <span>L’hôte révèle les classements un par un.</span>
            </div>
          )
        )}

        {allRankingsRevealed && (
          <button
            className="theme-primary-button"
            onClick={handleShowCompatibility}
            disabled={rankingCards.length !== players.length}
          >
            <Heart aria-hidden="true" />
            Afficher les compatibilités
          </button>
        )}
      </section>
    );
  }

  if (isLoadingAffinity || !progress) {
    return (
      <section className="order-reveal-screen reveal-loading">
        {isLoadingAffinity && <div className="loading-spinner" />}
        <p role={error ? 'alert' : undefined}>
          {error ?? 'Préparation des compatibilités...'}
        </p>
        {error && (
          <button className="theme-primary-button" onClick={() => void loadAffinityData()}>
            Réessayer
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="order-reveal-screen">
      <header className="order-reveal-heading">
        <span className="screen-kicker">Âmes sœurs</span>
        <h1>Vos compatibilités</h1>
        <p>Révélez vos compatibilités une à une. Chaque résultat reste privé aux deux joueurs concernés.</p>
      </header>

      <div
        className="reveal-progress"
        role="progressbar"
        aria-label="Progression de vos compatibilités révélées"
        aria-valuemin={0}
        aria-valuemax={progress.pairs_per_player}
        aria-valuenow={Math.min(progress.player_revealed_count, progress.pairs_per_player)}
      >
        <div className="reveal-progress-track">
          <span
            className="reveal-progress-value"
            style={{
              width: `${progress.pairs_per_player ? (Math.min(progress.player_revealed_count, progress.pairs_per_player) / progress.pairs_per_player) * 100 : 100}%`,
            }}
          />
        </div>
        <span>{Math.min(progress.player_revealed_count, progress.pairs_per_player)} / {progress.pairs_per_player} compatibilités révélées</span>
      </div>

      <div className="affinity-reveal-list" aria-live="polite">
        {reveals.map((reveal) => {
          const target = players.find((player) => player.id === reveal.target_player_id);
          if (!target) return null;
          return (
            <article className="affinity-result-card" key={reveal.target_player_id}>
              <span>Compatibilité avec {target.nickname}</span>
              <strong>{Math.round(reveal.compatibility_percentage ?? 0)}%</strong>
            </article>
          );
        })}
      </div>

      {error && <p className="state-card" role="alert">{error}</p>}

      {!playerHasFinished ? (
        <button
          className="theme-primary-button"
          onClick={() => void handleRevealNext()}
          disabled={isAdvancing}
        >
          <Heart aria-hidden="true" />
          {isAdvancing ? 'Révélation...' : 'Révéler une compatibilité'}
        </button>
      ) : (
        <div className="reveal-waiting">
          <EyeOff aria-hidden="true" />
          <span>Tu as révélé toutes tes compatibilités. En attente des autres joueurs.</span>
        </div>
      )}

      {isHost && (
        <button
          className="theme-next-button"
          onClick={() => void handleFinishReveal()}
          disabled={isAdvancing || !progress.all_players_complete}
        >
          {isAdvancing
            ? 'Passage à la suite...'
            : progress.all_players_complete
              ? 'Passer à la suite'
              : 'En attente des autres joueurs'}
          {progress.all_players_complete ? <ArrowRight aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      )}
    </section>
  );
};
