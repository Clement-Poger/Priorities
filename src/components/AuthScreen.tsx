import React, { useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { supabaseAuth, supabaseConfigurationError } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { ThemePicker } from './ThemePicker';
import type { AppTheme } from '../types/database.types';

const ACCOUNT_EMAIL_DOMAIN = 'accounts.priorities';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,24}$/;

interface AuthScreenProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  initialError?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  onThemeChange,
  initialError,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const haptics = useHaptics();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (supabaseConfigurationError) {
      setError(supabaseConfigurationError);
      return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('Le nom d’utilisateur doit contenir 3 à 24 caractères : lettres, chiffres, ., _ ou -.');
      return;
    }
    if (!password) {
      setError('Saisissez votre mot de passe.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: loginError } = await supabaseAuth.auth.signInWithPassword({
        email: `${normalizedUsername}@${ACCOUNT_EMAIL_DOMAIN}`,
        password,
      });
      if (loginError) throw loginError;
      haptics.success();
    } catch (submitError) {
      console.error('Erreur de connexion au compte:', submitError);
      setError('Nom d’utilisateur ou mot de passe incorrect.');
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-screen">
      <div className="auth-theme-picker">
        <ThemePicker theme={theme} onThemeChange={onThemeChange} />
      </div>
      <div className="auth-card">
        <div className="auth-mark" aria-hidden="true">
          <LogIn />
        </div>
        <span className="screen-kicker">Priorities</span>
        <h1>Content de te revoir</h1>
        <p className="auth-description">
          Connectez-vous avec le nom d’utilisateur et le mot de passe qui vous ont été fournis.
        </p>

        {error && <p className="auth-message auth-error" role="alert">{error}</p>}

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="auth-field">
            <span>Nom d’utilisateur</span>
            <input
              type="text"
              autoComplete="username"
              minLength={3}
              maxLength={24}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Ex. alex"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <label className="auth-field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre mot de passe"
              required
            />
          </label>
          <button
            className="theme-primary-button auth-submit"
            type="submit"
            disabled={isSubmitting || Boolean(supabaseConfigurationError)}
          >
            <LockKeyhole aria-hidden="true" />
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </section>
  );
};
