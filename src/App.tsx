import React, { useEffect, useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { RankingScreen } from './screens/RankingScreen';
import { GuessingScreen } from './screens/GuessingScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { ItemRevealScreen } from './screens/ItemRevealScreen';
import { HeaderBar } from './components/HeaderBar';
import { useGameSync } from './hooks/useGameSync';
import type { AppTheme } from './types/database.types';
import { supabaseAuth } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import { AuthScreen } from './components/AuthScreen';

const themes: AppTheme[] = ['nebula', 'ocean', 'sunset', 'forest'];

function getUsername(user: User): string {
  const emailUsername = user.email?.split('@')[0];
  return (emailUsername || user.user_metadata.username || '').toString().toLowerCase();
}

function getPlayerNickname(username: string): string {
  const nicknames: Record<string, string> = {
    noe: 'Noé',
    eva: 'Eva',
    clem: 'Clément',
  };
  return nicknames[username] ?? username;
}

function loadTheme(): AppTheme {
  try {
    const savedTheme = window.localStorage.getItem('priorities-theme');
    return themes.find((theme) => theme === savedTheme) ?? 'nebula';
  } catch (error) {
    console.error('Impossible de lire le thème enregistré:', error);
    return 'nebula';
  }
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(loadTheme);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    gameId: string;
    playerId: string;
    isHost: boolean;
  } | null>(null);

  const {
    gameState,
    players,
    currentRound,
    rankings,
    roundGuess,
    roundGuesses,
    roundReveal,
    revealOrder,
    roundProgress,
    syncError,
    isLoading,
    refresh,
  } = useGameSync(session?.gameId || '', session?.playerId || '');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('priorities-theme', theme);
    } catch (error) {
      console.error('Impossible d’enregistrer le thème choisi:', error);
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const { data: authListener } = supabaseAuth.auth.onAuthStateChange((_event, authSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      setAuthUser(authSession?.user ?? null);
      setIsAuthLoading(false);
      setAuthError(null);
    });

    void supabaseAuth.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return;
      if (error) throw error;
      setAuthUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active || receivedAuthEvent) return;
      console.error('Erreur de restauration de la session:', error);
      setAuthError(
        error instanceof Error ? error.message : 'Impossible de restaurer la connexion.'
      );
      setIsAuthLoading(false);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (gameState?.status === 'FINISHED') {
      setSession(null);
    }
  }, [gameState?.status]);

  if (!session) {
    return (
      <div className="app-shell w-full h-dvh bg-slate-50 text-slate-900 overflow-hidden" data-theme={theme}>
        {isAuthLoading ? (
          <div className="auth-loading">
            <div className="loading-spinner" />
            <span>Vérification de votre compte...</span>
          </div>
        ) : authUser ? (
          <HomeScreen
            userId={authUser.id}
            username={getUsername(authUser)}
            initialNickname={getPlayerNickname(getUsername(authUser))}
            onSignOut={async () => {
              const { error } = await supabaseAuth.auth.signOut();
              if (error) throw error;
            }}
            theme={theme}
            onThemeChange={setTheme}
            onGameJoined={(gameId, playerId, isHost) =>
              setSession({ gameId, playerId, isHost })
            }
          />
        ) : (
          <AuthScreen
            theme={theme}
            onThemeChange={setTheme}
            initialError={authError}
          />
        )}
      </div>
    );
  }

  const status = gameState?.status || 'LOBBY';

  return (
    <div className="app-shell w-full h-dvh bg-slate-50 text-slate-900 flex flex-col overflow-hidden" data-theme={theme}>
      <HeaderBar
        code={gameState?.code}
        roundNumber={gameState?.round_number}
        playerCount={players.length}
        theme={theme}
        onThemeChange={setTheme}
      />

      <main className="game-stage flex-1 overflow-hidden">
        {syncError && (
          <div className="sync-error" role="alert">
            <span>{syncError}</span>
            <button onClick={() => void refresh()}>Réessayer</button>
          </div>
        )}

        {!gameState && isLoading && (
          <div className="loading-state flex h-full flex-col items-center justify-center text-slate-500">
            <div className="loading-spinner mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            <p className="text-sm font-medium">Connexion à la partie...</p>
          </div>
        )}

        {!gameState && !isLoading && !syncError && (
          <p className="state-card">Cette partie est introuvable ou n’est plus disponible.</p>
        )}

        {gameState && status === 'LOBBY' && (
          <LobbyScreen
            gameId={session.gameId}
            gameCode={gameState?.code || ''}
            players={players}
            currentPlayerId={session.playerId}
            isHost={session.isHost}
            currentRoundIndex={currentRound?.round_index ?? 0}
            roundLimit={gameState.round_limit}
            cardCount={gameState.card_count}
            rankingTimerSeconds={gameState.ranking_timer_seconds}
            rankingRevealMode={gameState.ranking_reveal_mode}
            onRefresh={refresh}
            onLobbyClosed={() => setSession(null)}
          />
        )}

        {gameState && status === 'RANKING' && (
          <RankingScreen
            round={currentRound}
            playerId={session.playerId}
            players={players}
            rankings={rankings}
            submittedCount={roundProgress.submittedCount}
            rankingStartedAt={gameState.ranking_started_at}
            rankingTimerSeconds={gameState.ranking_timer_seconds}
          />
        )}

        {gameState && status === 'GUESSING' && (
          <GuessingScreen
            round={currentRound}
            players={players}
            rankings={rankings}
            roundGuess={roundGuess}
            playerId={session.playerId}
            submittedCount={roundProgress.guessedCount}
          />
        )}

        {gameState && status === 'RESULTS' && (
          <ResultsScreen
            gameId={session.gameId}
            round={currentRound}
            players={players}
            guesses={roundGuesses}
            isHost={session.isHost}
            roundLimit={gameState.round_limit}
            cardCount={gameState.card_count}
          />
        )}

        {gameState && status === 'REVEAL' && (
          <ItemRevealScreen
            round={currentRound}
            players={players}
            rankings={rankings}
            roundReveal={roundReveal}
            revealOrder={revealOrder}
            rankingRevealMode={gameState.ranking_reveal_mode}
            playerId={session.playerId}
            isHost={session.isHost}
          />
        )}

      </main>
    </div>
  );
};

export default App;