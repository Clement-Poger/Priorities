import React from 'react';
import { Users, Sparkles } from 'lucide-react';
import { ThemePicker } from './ThemePicker';
import type { AppTheme } from '../types/database.types';

interface HeaderBarProps {
  code?: string;
  roundNumber?: number;
  playerCount?: number;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  code,
  roundNumber,
  playerCount,
  theme,
  onThemeChange,
}) => {
  return (
    <header className="app-header w-full bg-slate-900 text-white pt-[env(safe-area-inset-top)] px-4 pb-3 shadow-md sticky top-0 z-50">
      <div className="app-header-inner flex items-center justify-between h-12 max-w-md mx-auto">
        {/* Brand/Logo */}
        <div className="app-brand flex items-center space-x-2">
          <div className="p-1.5 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-lg shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-black text-lg tracking-tight bg-gradient-to-r from-indigo-300 via-pink-300 to-white bg-clip-text text-transparent">
            Priorities
          </span>
        </div>

        {/* Dynamic Game Info */}
        <div className="header-game-info flex items-center space-x-2">
          <ThemePicker theme={theme} onThemeChange={onThemeChange} />
          {roundNumber !== undefined && (
            <span className="header-pill round-pill text-xs font-semibold bg-indigo-950 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
              Round {roundNumber}
            </span>
          )}

          {code && (
            <span className="header-pill text-xs font-mono font-bold bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md tracking-wider border border-slate-700">
              #{code}
            </span>
          )}

          {playerCount !== undefined && (
            <div className="header-pill player-count flex items-center space-x-1 text-xs text-slate-400 bg-slate-800/80 px-2 py-1 rounded-md">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>{playerCount}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};