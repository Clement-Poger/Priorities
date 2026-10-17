import React from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { calculateAffinityScore } from '../utils/scoreCalculator';
import type { Player, PlayerRanking, RoundGuess } from '../types/database.types';

interface Props {
  players: Player[];
  rankings: PlayerRanking[];
  guesses: RoundGuess[];
  isHost: boolean;
  isStartingNextRound: boolean;
  onNextRound: () => void;
  error?: string | null;
}

export const RevealScreen: React.FC<Props> = ({
  players,
  rankings,
  guesses,
  isHost,
  isStartingNextRound,
  onNextRound,
  error,
}) => {
  const pairs: Array<{ p1: Player; p2: Player; score: number }> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];
      const r1 = rankings.find((ranking) => ranking.player_id === p1.id)?.ranking ?? [];
      const r2 = rankings.find((ranking) => ranking.player_id === p2.id)?.ranking ?? [];
      pairs.push({ p1, p2, score: calculateAffinityScore(r1, r2) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  return (
    <section className="connections-screen">
      <header className="connections-heading">
        <span className="screen-kicker">Fin du round</span>
        <h1>Les âmes sœurs</h1>
        <p>Les classements sont révélés. Découvrez maintenant vos affinités.</p>
      </header>

      <div className="connections-list">
        {pairs.map(({ p1, p2, score }, index) => (
          <article
            className="connection-card"
            key={`${p1.id}-${p2.id}`}
            style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
          >
            <div className="connection-players">
              <span>{p1.nickname}</span>
              <span className="connection-line" aria-label="liaison" />
              <span>{p2.nickname}</span>
            </div>
            <div className="connection-score">
              <span>{score}</span>
              <small>points</small>
            </div>
          </article>
        ))}
        {pairs.length === 0 && (
          <p className="state-card">Il faut au moins deux joueurs pour afficher les affinités.</p>
        )}
      </div>

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
                {target && ` (ordre de ${target.nickname})`}
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
        <button
          className="theme-next-button"
          onClick={onNextRound}
          disabled={isStartingNextRound}
        >
          {isStartingNextRound ? 'Préparation du round...' : 'Lancer le round suivant'}
          <ArrowRight aria-hidden="true" />
        </button>
      ) : (
        <p className="reveal-waiting">En attente de l’hôte pour le prochain round.</p>
      )}
    </section>
  );
};
