import React, { useState } from 'react';
import { supabase, supabaseAuth, supabaseConfigurationError } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { Sparkles, Users, PlusCircle, LogIn, LogOut } from 'lucide-react';
import evaAvatar from '../assets/eva.webp';
import noeAvatar from '../assets/noe.webp';
import clementAvatar from '../assets/clement.png';
import { ThemePicker } from '../components/ThemePicker';
import type { AppTheme } from '../types/database.types';

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
  const [mode, setMode] = useState<'menu' | 'join'>('menu');
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
          .insert([{ code: generateCode(), status: 'LOBBY', round_number: 1 }])
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
    <div className="home-screen flex flex-col h-full max-w-md mx-auto p-6 justify-between select-none">
      <div className="home-theme-picker">
        <ThemePicker theme={theme} onThemeChange={onThemeChange} />
      </div>
      <div className="home-account">
        <span>Connecté en tant que {username}</span>
        <button type="button" onClick={() => void handleSignOut()} aria-label="Se déconnecter">
          <LogOut aria-hidden="true" />
          <span>Déconnexion</span>
        </button>
      </div>
      <div className="home-hero flex flex-col items-center mt-8 space-y-3 text-center">
        <div className="home-logo p-4 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-2xl shadow-xl">
          <Sparkles className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-indigo-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
          Priorities
        </h1>
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
              onClick={handleCreateGame}
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

      <div className="text-center text-[11px] text-slate-400 pb-[env(safe-area-inset-bottom)]">
        Inspiré du jeu de société original • Multi-joueurs en temps réel
      </div>
    </div>
  );
};