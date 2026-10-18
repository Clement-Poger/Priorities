import React from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { Player, RoundGuess } from '../types/database.types';

interface Props {
  players: Player[];
  guesses: RoundGuess[];
  isHost: boolean;
  isStartingNextRound: boolean;
  isReturningToLobby: boolean;
  isFinishingGame: boolean;
  isLastRound: boolean;
  onNextRound: () => void;
  onReturnToLobby: () => void;
  onFinishGame: () => void;
  error?: string | null;
}

export const RevealScreen: React.FC<Props> = ({
  players,
  guesses,
  isHost,
  isStartingNextRound,
  isReturningToLobby,
  isFinishingGame,
  isLastRound,
  onNextRound,
  onReturnToLobby,
  onFinishGame,
  error,
}) => (
  <section className="connections-screen">
    <header className="connections-heading">
      <span className="screen-kicker">Fin du round</span>
      <h1>Réponses du round</h1>
      <p>Découvrez qui a retrouvé le classement de chaque joueur.</p>
    </header>

    <section className="guess-results">
      <h2>Qui a deviné juste ?</h2>
      {guesses.map((guess) => {
        const guesser = players.find((player) => player.id === guess.guesser_player_id);
        const target = players.find((player) => player.id === guess.target_player_id);
        const guessed = players.find((player) => player.id === guess.guessed_player_id);
        const isCorrect = guess.guessed_player_id === guess.target_player_id;
        return (
          <article className="guess-result-row" key={guess.guesser_player_id}>
            <span>{guesser?.nickname ?? 'Joueur'}</span>
            <span>
              {guessed?.nickname ?? 'Aucune réponse'}
              {target && ` (classement de ${target.nickname})`}
            </span>
            <strong className={isCorrect ? 'guess-correct' : 'guess-incorrect'}>
              {isCorrect ? <><Check aria-hidden="true" /> +1</> : <><X aria-hidden="true" /> 0</>}
            </strong>
          </article>
        );
      })}
    </section>

    <section className="guess-scoreboard">
      <h2>Scores</h2>
      <div>
        {[...players]
          .sort((first, second) => (second.score ?? 0) - (first.score ?? 0))
          .map((player) => (
            <span className="guess-score-chip" key={player.id}>
              {player.nickname} <strong>{player.score ?? 0}</strong>
            </span>
          ))}
      </div>
    </section>

    {error && <p className="state-card" role="alert">{error}</p>}
    {isHost ? (
      <div className="results-actions">
        {!isLastRound && (
          <button
            className="theme-next-button"
            onClick={onNextRound}
            disabled={isStartingNextRound || isReturningToLobby || isFinishingGame}
          >
            {isStartingNextRound ? 'Préparation du round...' : 'Lancer le round suivant'}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
        {isLastRound && (
          <button
            className="theme-next-button"
            onClick={onFinishGame}
            disabled={isStartingNextRound || isReturningToLobby || isFinishingGame}
          >
            {isFinishingGame ? 'Fin de la partie...' : 'Terminer la partie'}
          </button>
        )}
        <button
          className="theme-secondary-button"
          onClick={onReturnToLobby}
          disabled={isStartingNextRound || isReturningToLobby || isFinishingGame}
        >
          {isReturningToLobby ? 'Retour au lobby...' : 'Retourner au lobby'}
        </button>
      </div>
    ) : (
      <p className="reveal-waiting">En attente de l’hôte pour le prochain round ou le retour au lobby.</p>
    )}
  </section>
);
