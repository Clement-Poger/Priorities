import React, { useState } from 'react';
import { supabase, supabaseAuth, supabaseConfigurationError } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { Sparkles, Users, PlusCircle, LogIn, LogOut, Layers3, ListOrdered, Clock3, Eye, ArrowLeft } from 'lucide-react';
import evaAvatar from '../assets/eva.webp';
import noeAvatar from '../assets/noe.webp';
import clementAvatar from '../assets/clement.png';
import { ThemePicker } from '../components/ThemePicker';
import type { AppTheme, RankingRevealMode } from '../types/database.types';

interface HomeScreenProps {
  onGameJoined: (gameId: string, playerId: string, isHost: boolean) => void;
  userId: string;
  username: string;
  initialNickname: string;
  onSignOut: () => Promise<void>;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onGameJoined,
  userId,
  username,
  initialNickname,
  onSignOut,
  theme,
  onThemeChange,
}) => {
  const [gameCode, setGameCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join' | 'create'>('menu');
  const [roundLimit, setRoundLimit] = useState(5);
  const [cardCount, setCardCount] = useState(5);
  const [rankingTimerSeconds, setRankingTimerSeconds] = useState(60);
  const [rankingRevealMode, setRankingRevealMode] = useState<RankingRevealMode>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const haptics = useHaptics();

  const saveProfile = async () => {
    const { error: profileError } = await supabaseAuth.from('profiles').upsert(
      { user_id: userId, nickname: initialNickname },
      { onConflict: 'user_id' }
    );
    if (profileError) throw profileError;
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateGame = async () => {
    if (supabaseConfigurationError) {
      setError(supabaseConfigurationError);
      return;
    }
    setLoading(true);
    setError(null);
    haptics.mediumTap();

    try {
      await saveProfile();
      let game: { id: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error: gameError } = await supabase
          .from('games')
          .insert([{
            code: generateCode(),
            status: 'LOBBY',
            round_number: 1,
            round_limit: roundLimit,
            card_count: cardCount,
            ranking_timer_seconds: rankingTimerSeconds,
            ranking_reveal_mode: rankingRevealMode,
          }])
          .select()
          .single();

        if (gameError?.code === '23505' && attempt < 4) continue;
        if (gameError) throw gameError;
        if (!data) throw new Error('La partie a été créée sans retourner ses informations.');
        game = data;
        break;
      }
      if (!game) throw new Error('Impossible de générer un code de salon unique.');

      const { data: player, error: playerErr } = await supabase
        .from('players')
        .insert([{
          game_id: game.id,
          nickname: initialNickname,
          auth_user_id: userId,
          is_host: true,
        }])
        .select()
        .single();

      if (playerErr) throw playerErr;

      const { error: hostError } = await supabase
        .from('games')
        .update({ host_id: player.id })
        .eq('id', game.id);
      if (hostError) throw hostError;

      haptics.success();
      onGameJoined(game.id, player.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (supabaseConfigurationError) {
      setError(supabaseConfigurationError);
      return;
    }
    if (!gameCode.trim()) {
      setError('Saisis le code du salon.');
      haptics.warning();
      return;
    }

    setLoading(true);
    setError(null);
    haptics.mediumTap();

    try {
      await saveProfile();
      const { data: game, error: gameErr } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode.trim().toUpperCase())
        .eq('status', 'LOBBY')
        .single();

      if (gameErr || !game) {
        throw new Error('Salon introuvable ou déjà démarré. Vérifie le code.');
      }

      const { data: player, error: playerErr } = await supabase
        .from('players')
        .insert([{
          game_id: game.id,
          nickname: initialNickname,
          auth_user_id: userId,
          is_host: false,
        }])
        .select()
        .single();

      if (playerErr) throw playerErr;

      haptics.success();
      onGameJoined(game.id, player.id, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre la partie');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await onSignOut();
      haptics.success();
    } catch (signOutError) {
      console.error('Erreur déconnexion du compte:', signOutError);
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'Impossible de vous déconnecter.'
      );
      haptics.error();
    }
  };

  return (
    <div className={`home-screen flex flex-col h-full max-w-md mx-auto p-6 justify-between select-none ${mode === 'create' ? 'home-screen-configuring' : ''}`}>
      <div className="home-theme-picker">
        <ThemePicker theme={theme} onThemeChange={onThemeChange} />
      </div>
      <div className="home-account">
        <span>Connecté en tant que {username}</span>
        <button type="button" onClick={() => void handleSignOut()} aria-label="Se déconnecter">
          <LogOut aria-hidden="true" />
        </button>
      </div>
      <div className="home-hero flex flex-col items-center mt-8 space-y-3 text-center">
        <div className="home-logo p-4 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-2xl shadow-xl">
          <Sparkles className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-indigo-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
          Priorities
        </h1>
        {mode === 'create' && <p className="home-hero-subtitle">Ta partie, tes règles</p>}
        <div className="home-avatars" aria-hidden="true">
          <img src={evaAvatar} alt="" />
          <img src={noeAvatar} alt="" />
          <img src={clementAvatar} alt="" />
        </div>
      </div>

      <div className="home-content space-y-4 my-auto">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl text-center font-medium" role="alert">
            {error}
          </div>
        )}
        {supabaseConfigurationError && !error && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl text-center font-medium" role="status">
            {supabaseConfigurationError}
          </div>
        )}

        {mode === 'menu' ? (
          <div className="space-y-3 pt-2">
            <button
              onClick={() => { setMode('create'); setError(null); haptics.lightTap(); }}
              disabled={loading || Boolean(supabaseConfigurationError)}
              className="home-primary w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 active:opacity-90 text-white font-bold rounded-xl shadow-md flex items-center justify-center space-x-2 transition-transform active:scale-98"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Créer une partie</span>
            </button>

            <button
              onClick={() => { setMode('join'); haptics.lightTap(); }}
              disabled={loading || Boolean(supabaseConfigurationError)}
              className="home-secondary w-full py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:bg-slate-50 flex items-center justify-center space-x-2 transition-transform active:scale-98"
            >
              <LogIn className="w-5 h-5 text-indigo-600" />
              <span>Rejoindre avec un code</span>
            </button>
          </div>
        ) : mode === 'create' ? (
          <div className="game-settings">
            <header className="game-settings-header">
              <button
                type="button"
                className="game-settings-back"
                onClick={() => { setMode('menu'); setError(null); haptics.lightTap(); }}
                aria-label="Retour au menu"
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <div>
                <span className="game-settings-kicker">NOUVELLE PARTIE</span>
                <h2>Configure ta partie</h2>
                <p className="game-settings-description">Choisis le rythme et les règles de votre session.</p>
              </div>
            </header>

            <label className="game-setting game-setting-card game-setting-menu">
              <span className="game-setting-title"><Layers3 aria-hidden="true" /><span>Nombre de manches</span></span>
              <select
                value={roundLimit}
                aria-label="Nombre de manches"
                onChange={(event) => setRoundLimit(Number(event.target.value))}
              >
                {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count} {count === 1 ? 'manche' : 'manches'}</option>
                ))}
              </select>
            </label>

            <label className="game-setting game-setting-card game-setting-menu">
              <span className="game-setting-title"><ListOrdered aria-hidden="true" /><span>Cartes par manche</span></span>
              <select
                value={cardCount}
                aria-label="Nombre de cartes par manche"
                onChange={(event) => setCardCount(Number(event.target.value))}
              >
                {Array.from({ length: 8 }, (_, index) => index + 3).map((count) => (
                  <option key={count} value={count}>{count} cartes</option>
                ))}
              </select>
            </label>

            <label className="game-setting game-setting-card game-setting-menu">
              <span className="game-setting-title"><Clock3 aria-hidden="true" /><span>Temps pour classer</span></span>
              <select
                id="ranking-timer"
                value={rankingTimerSeconds}
                aria-label="Temps pour classer"
                onChange={(event) => setRankingTimerSeconds(Number(event.target.value))}
              >
                <option value={0}>Sans limite</option>
                <option value={30}>30 s</option>
                <option value={60}>1 min</option>
                <option value={90}>1 min 30 s</option>
                <option value={120}>2 min</option>
              </select>
            </label>

            <label className="game-setting game-setting-card game-setting-menu">
              <span className="game-setting-title"><Eye aria-hidden="true" /><span>Révélation des classements</span></span>
              <select
                value={rankingRevealMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'ALL' || value === 'ONE_BY_ONE') setRankingRevealMode(value);
                }}
              >
                <option value="ALL">Tous ensemble</option>
                <option value="ONE_BY_ONE">Un par un</option>
              </select>
            </label>

            <p className="game-settings-note">À la fin du temps, le classement en cours est envoyé automatiquement.</p>

            <button
              onClick={() => void handleCreateGame()}
              disabled={loading || Boolean(supabaseConfigurationError)}
              className="home-primary w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 active:opacity-90 text-white font-bold rounded-xl shadow-md flex items-center justify-center space-x-2 transition-transform active:scale-98"
            >
              <PlusCircle className="w-5 h-5" />
              <span>{loading ? 'Création...' : 'Créer le salon'}</span>
            </button>

          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="home-field space-y-1">
              <label htmlFor="game-code" className="text-xs font-bold text-slate-700 uppercase tracking-wider ml-1">
                Code du salon (4 lettres)
              </label>
              <input
                id="game-code"
                type="text"
                maxLength={4}
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                placeholder="Ex: ABCD"
                className="w-full px-4 py-3.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-center text-xl font-bold tracking-widest text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleJoinGame}
              disabled={loading || Boolean(supabaseConfigurationError)}
              className="home-primary w-full py-4 bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center space-x-2 transition-transform active:scale-98"
            >
              <Users className="w-5 h-5" />
              <span>Rejoindre le salon</span>
            </button>

            <button
              onClick={() => { setMode('menu'); setError(null); haptics.lightTap(); }}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 text-center"
            >
              ← Retour au menu
            </button>
          </div>
        )}
      </div>

    </div>
  );
};