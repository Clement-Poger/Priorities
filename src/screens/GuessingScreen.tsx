import React, { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import type { Card, Player, PlayerRanking, Round, RoundGuess } from '../types/database.types';
import { loadRoundCards } from '../utils/loadRoundCards';

interface Props {
  round: Round | null;
  players: Player[];
  rankings: PlayerRanking[];
  roundGuess: RoundGuess | null;
  playerId: string;
  submittedCount: number;
}

export const GuessingScreen: React.FC<Props> = ({
  round,
  players,
  rankings,
  roundGuess,
  playerId,
  submittedCount,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [cards, setCards] = useState<Array<Pick<Card, 'id' | 'content'>>>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  const hasSubmitted = Boolean(roundGuess?.is_submitted);
  const targetPlayer = players.find((player) => player.id === roundGuess?.target_player_id);
  const targetRanking = rankings.find(
    (ranking) => ranking.player_id === roundGuess?.target_player_id
  );
  const candidates = players.filter((player) => player.id !== playerId);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const orderedCards = (targetRanking?.ranking ?? [])
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is Pick<Card, 'id' | 'content'> => Boolean(card));
  const cardsAreReady = Boolean(targetPlayer && orderedCards.length === cards.length);

  useEffect(() => {
    let active = true;
    const loadCards = async () => {
      if (!round) {
        setIsLoadingCards(false);
        return;
      }
      try {
        const loadedCards = await loadRoundCards(round.id);
        if (active) setCards(loadedCards);
      } catch (loadError) {
        console.error('Erreur chargement des cartes à deviner:', loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les cartes à deviner.'
          );
        }
      } finally {
        if (active) setIsLoadingCards(false);
      }
    };
    void loadCards();
    return () => {
      active = false;
    };
  }, [round?.id]);

  const submitGuess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!round || !selectedPlayerId || isSubmitting || hasSubmitted) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: guessError } = await supabase.rpc('submit_round_guess', {
        p_round_id: round.id,
        p_guesser_player_id: playerId,
        p_guessed_player_id: selectedPlayerId,
      });
      if (guessError) throw guessError;
      haptics.success();
    } catch (submitError) {
      console.error('Erreur soumission de la devinette:', submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Impossible d’enregistrer votre réponse.'
      );
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!round || !roundGuess) {
    return (
      <section className="guess-screen">
        <p className="state-card" role="alert">
          Votre classement à deviner n’a pas encore été attribué. Actualisez la partie.
        </p>
      </section>
    );
  }

  if (hasSubmitted) {
    return (
      <section className="guess-screen guess-waiting">
        <CheckCircle2 aria-hidden="true" />
        <span className="screen-kicker">À toi de deviner</span>
        <h1>Réponse enregistrée</h1>
        <p>La révélation commence lorsque tout le monde aura répondu.</p>
        <div className="guess-progress">
          {submittedCount} / {players.length} joueurs ont répondu
        </div>
      </section>
    );
  }

  if (isLoadingCards || !cardsAreReady) {
    return (
      <section className="guess-screen guess-waiting">
        {error ? (
          <p className="state-card" role="alert">{error}</p>
        ) : (
          <>
            <div className="loading-spinner" />
            <p>Préparation du classement à deviner...</p>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="guess-screen">
      <header className="guess-heading">
        <span className="screen-kicker">À toi de deviner</span>
        <h1>Qui a fait ce classement ?</h1>
        <p>Un autre joueur a classé ces cartes. À toi de retrouver lequel.</p>
      </header>

      <ol className="guess-order" aria-label="Classement à deviner">
        {orderedCards.map((card, index) => (
          <li key={card.id} className="guess-order-item">
            <span className="guess-order-number">{index + 1}</span>
            <span>{card.content}</span>
          </li>
        ))}
      </ol>

      <form className="guess-form" onSubmit={(event) => void submitGuess(event)}>
        <fieldset>
          <legend>À qui appartient ce classement ?</legend>
          <div className="guess-candidates">
            {candidates.map((player) => (
              <label
                className={`guess-candidate ${selectedPlayerId === player.id ? 'guess-candidate-selected' : ''}`}
                key={player.id}
              >
                <input
                  type="radio"
                  name="guessed-player"
                  value={player.id}
                  checked={selectedPlayerId === player.id}
                  onChange={() => setSelectedPlayerId(player.id)}
                />
                <span>{player.nickname}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button
          type="submit"
          className="theme-primary-button"
          disabled={!selectedPlayerId || isSubmitting}
        >
          <Send aria-hidden="true" />
          {isSubmitting ? 'Enregistrement...' : 'Valider ma réponse'}
        </button>
      </form>
    </section>
  );
};
