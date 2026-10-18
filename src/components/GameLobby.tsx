import React from 'react';
import { PlayerCard } from './PlayerCard';
import { Play, Copy, Share2, Sparkles, X, RefreshCw, Layers3, ListOrdered, Clock3, Eye } from 'lucide-react';
import type { Player, RankingRevealMode } from '../types/database.types';

interface GameLobbyProps {
  code: string;
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  canStartGame: boolean;
  roundLimit: number;
  cardCount: number;
  rankingTimerSeconds: number;
  rankingRevealMode: RankingRevealMode;
  onStartGame: () => void;
  onCloseLobby: () => void;
  onRefresh: () => void;
  isStarting?: boolean;
  isClosing?: boolean;
  isRefreshing?: boolean;
  startError?: string | null;
  closeError?: string | null;
}

export const GameLobby: React.FC<GameLobbyProps> = ({
  code,
  players,
  currentPlayerId,
  isHost,
  canStartGame,
  roundLimit,
  cardCount,
  rankingTimerSeconds,
  rankingRevealMode,
  onStartGame,
  onCloseLobby,
  onRefresh,
  isStarting = false,
  isClosing = false,
  isRefreshing = false,
  startError,
  closeError,
}) => {
  const [shareError, setShareError] = React.useState<string | null>(null);
  const timerLabel = rankingTimerSeconds === 0
    ? 'Sans limite'
    : rankingTimerSeconds < 60
      ? `${rankingTimerSeconds} s`
    : rankingTimerSeconds % 60 === 0
      ? `${rankingTimerSeconds / 60} min`
      : `${Math.floor(rankingTimerSeconds / 60)} min ${rankingTimerSeconds % 60} s`;

  const copyCode = async () => {
    setShareError(null);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('La copie du code n’est pas disponible dans ce navigateur.');
      }
      await navigator.clipboard.writeText(code);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (error) {
      console.error('Impossible de copier le code:', error);
      setShareError(
        error instanceof Error ? error.message : 'Impossible de copier le code.'
      );
    }
  };

  const shareGame = async () => {
    setShareError(null);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Rejoins ma partie de Priorities !',
          text: `Rejoins notre salon Priorities avec le code : ${code}`,
          url: window.location.href,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Impossible de partager la partie:', error);
        setShareError('Impossible de partager la partie.');
      }
    } else {
      await copyCode();
    }
  };

  return (
    <div className="lobby-screen flex flex-col h-full max-w-md mx-auto p-4 justify-between">
      {/* Top Banner / Code */}
      <div className="lobby-main space-y-4">
        <div className="room-card bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-5 rounded-2xl shadow-lg text-center space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-200">
            Code du Salon
          </p>
          <div className="lobby-room-code text-4xl font-black font-mono tracking-widest bg-white/10 py-2 px-4 rounded-xl backdrop-blur-xs border border-white/20 inline-block">
            {code}
          </div>
          <div className="lobby-game-settings" aria-label="Configuration de la partie">
            <div className="lobby-game-setting">
              <Layers3 aria-hidden="true" />
              <span>{roundLimit} manche{roundLimit > 1 ? 's' : ''}</span>
            </div>
            <div className="lobby-game-setting">
              <ListOrdered aria-hidden="true" />
              <span>{cardCount} carte{cardCount > 1 ? 's' : ''} par manche</span>
            </div>
            <div className="lobby-game-setting">
              <Clock3 aria-hidden="true" />
              <span>{timerLabel}</span>
            </div>
            <div className="lobby-game-setting">
              <Eye aria-hidden="true" />
              <span>{rankingRevealMode === 'ALL' ? 'Tous ensemble' : 'Un par un'}</span>
            </div>
          </div>
          
          <div className="lobby-share-actions flex justify-center space-x-2 pt-1">
            <button
              onClick={copyCode}
              className="lobby-share-button flex items-center space-x-1.5 bg-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copier</span>
            </button>
            <button
              onClick={shareGame}
              className="lobby-share-button flex items-center space-x-1.5 bg-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Partager</span>
            </button>
          </div>
          {(shareError || startError || closeError) && (
            <p className="inline-error" role="alert">{shareError || startError || closeError}</p>
          )}
        </div>

        {/* Players List */}
        <div className="lobby-players space-y-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Joueurs connectés
            </h3>
            <span className="lobby-player-count text-xs font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
              {players.length}
            </span>
            <button
              className="lobby-refresh-button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Actualiser la liste des joueurs"
              title="Actualiser le lobby"
            >
              <RefreshCw className={isRefreshing ? 'refreshing' : ''} aria-hidden="true" />
              <span>{isRefreshing ? 'Actualisation...' : 'Actualiser'}</span>
            </button>
          </div>

          <div className="player-list space-y-2 max-h-[45vh] overflow-y-auto pr-1">
            {players.map((p) => (
              <PlayerCard
                key={p.id}
                nickname={p.nickname}
                avatarUrl={p.avatar_url}
                isHost={p.is_host}
                isReady={true}
                isCurrentPlayer={p.id === currentPlayerId}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="lobby-footer pt-4 pb-[env(safe-area-inset-bottom)]">
        {isHost ? (
          <div className="lobby-footer-actions">
            <button
              type="button"
              onClick={onStartGame}
              disabled={players.length < 2 || !canStartGame || isStarting || isClosing}
              className={`lobby-launch-button w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center space-x-2 transition-all active:scale-98 ${
                players.length >= 2
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>
                {!canStartGame
                  ? 'Manches terminées'
                  : players.length >= 2
                  ? isStarting ? 'Démarrage...' : 'Lancer la Partie'
                  : 'En Attente'}
              </span>
            </button>
            <button
              type="button"
              className="lobby-close-button"
              onClick={onCloseLobby}
              disabled={isStarting || isClosing}
              aria-label="Fermer le salon pour tous les joueurs"
              title="Fermer le salon"
            >
              <X aria-hidden="true" />
              <span>{isClosing ? 'Fermeture...' : 'Fermer'}</span>
            </button>
          </div>
        ) : (
          <div className="waiting-room bg-slate-100 border border-slate-200 text-slate-600 p-4 rounded-xl text-center text-sm font-medium flex items-center justify-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-500 animate-bounce" />
            <span>En attente de l'hôte pour démarrer...</span>
          </div>
        )}
      </div>
    </div>
  );
};