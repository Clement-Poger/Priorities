import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type {
  Card,
  Player,
  PlayerRanking,
  Round,
  RoundReveal,
  RoundRevealOrder,
} from '../types/database.types';
import { loadRoundCards } from '../utils/loadRoundCards';

interface Props {
  round: Round | null;
  roundReveal: RoundReveal | null;
  revealOrder: RoundRevealOrder[];
  players: Player[];
  rankings: PlayerRanking[];
  playerId: string;
}

export const ItemRevealScreen: React.FC<Props> = ({
  round,
  roundReveal,
  revealOrder,
  players,
  rankings,
  playerId,
}) => {
  const [cards, setCards] = useState<Array<Pick<Card, 'id' | 'content'>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  useEffect(() => {
    let active = true;
    const fetchCards = async () => {
      if (!round) {
        setLoadError('Aucun round actif n’a été trouvé.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      try {
        const loadedCards = await loadRoundCards(round.id);
        if (active) setCards(loadedCards);
      } catch (fetchError) {
        console.error('Erreur chargement des cartes à révéler:', fetchError);
        if (active) {
          setLoadError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Impossible de charger les cartes à révéler.'
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchCards();
    return () => {
      active = false;
    };
  }, [round?.id]);

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const revealedOrders = revealOrder.flatMap((entry) => {
    const player = players.find((candidate) => candidate.id === entry.player_id);
    const ranking = rankings.find((candidate) => candidate.player_id === entry.player_id);
    if (!player || !ranking) return [];
    const orderedCards = ranking.ranking
      .map((cardId) => cardsById.get(cardId))
      .filter((card): card is Pick<Card, 'id' | 'content'> => Boolean(card));
    if (orderedCards.length !== ranking.ranking.length) return [];
    return [{ player, orderedCards }];
  });

  const revealedCount = roundReveal?.revealed_count ?? 0;
  const revealComplete = players.length > 0 && revealedCount >= players.length;
  const isController = roundReveal?.controller_player_id === playerId;
  const controller = players.find(
    (player) => player.id === roundReveal?.controller_player_id
  );

  const handleRevealNext = async () => {
    if (!round || !isController || isAdvancing || revealComplete) return;
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
      console.error('Erreur progression du reveal:', revealError);
      setError(
        revealError instanceof Error
          ? revealError.message
          : 'Impossible de révéler le classement suivant.'
      );
      haptics.error();
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleFinishReveal = async () => {
    if (!round || !isController || isAdvancing || !revealComplete) return;
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
      setError(
        finishError instanceof Error
          ? finishError.message
          : 'Impossible de terminer le reveal.'
      );
      haptics.error();
    } finally {
      setIsAdvancing(false);
    }
  };

  if (isLoading) {
    return (
      <section className="order-reveal-screen reveal-loading">
        <div className="loading-spinner" />
        <p>Préparation des classements à révéler...</p>
      </section>
    );
  }

  if (!roundReveal || loadError) {
    return (
      <section className="order-reveal-screen">
        <p className="state-card" role="alert">
          {loadError ?? 'La progression du reveal est introuvable. Vérifiez le schéma Supabase.'}
        </p>
      </section>
    );
  }

  return (
    <section className="order-reveal-screen">
      <header className="order-reveal-heading">
        <span className="screen-kicker">Révélation des ordres</span>
        <h1>Qui a choisi quoi ?</h1>
        <p>Les classements se dévoilent un par un. Les affinités seront annoncées après.</p>
      </header>

      <div
        className="reveal-progress"
        role="progressbar"
        aria-label="Progression des classements révélés"
        aria-valuemin={0}
        aria-valuemax={players.length}
        aria-valuenow={Math.min(revealedCount, players.length)}
      >
        <div className="reveal-progress-track">
          <span
            className="reveal-progress-value"
            style={{
              width: `${players.length ? (Math.min(revealedCount, players.length) / players.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span>{Math.min(revealedCount, players.length)} / {players.length} ordres révélés</span>
      </div>

      <div className="order-reveal-list" aria-live="polite">
        {revealedOrders.map(({ player, orderedCards }, orderIndex) => (
          <article className="order-reveal-card" key={player.id}>
            <h2>
              <span>{orderIndex + 1}</span>
              L’ordre de {player.nickname}
            </h2>
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

      {error && <p className="state-card" role="alert">{error}</p>}

      <div className="reveal-controls">
        {isController ? (
          <button
            className="theme-primary-button"
            onClick={() => void (revealComplete ? handleFinishReveal() : handleRevealNext())}
            disabled={isAdvancing}
          >
            {revealComplete ? <ArrowRight aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {isAdvancing
              ? 'Mise à jour...'
              : revealComplete
                ? 'Révéler les âmes sœurs'
                : revealedCount === 0
                  ? 'Révéler le premier ordre'
                  : 'Révéler l’ordre suivant'}
          </button>
        ) : (
          <div className="reveal-waiting">
            <EyeOff aria-hidden="true" />
            <span>
              {revealComplete
                ? `${controller?.nickname ?? 'Le joueur désigné'} va révéler les âmes sœurs.`
                : `${controller?.nickname ?? 'Le joueur désigné'} révèle les ordres un par un.`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
