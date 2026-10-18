import React from 'react';
import { Palette } from 'lucide-react';
import type { AppTheme } from '../types/database.types';

const themeLabels: Record<AppTheme, string> = {
  ocean: 'Bleu',
  forest: 'Vert',
  nebula: 'Violet',
  sunset: 'Rouge',
};

const isAppTheme = (value: string): value is AppTheme =>
  Object.prototype.hasOwnProperty.call(themeLabels, value);

interface ThemePickerProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const ThemePicker: React.FC<ThemePickerProps> = ({ theme, onThemeChange }) => (
  <label className="theme-picker">
    <Palette aria-hidden="true" />
    <span>Thème</span>
    <select
      aria-label="Thème de l’application"
      value={theme}
      onChange={(event) => {
        if (isAppTheme(event.target.value)) onThemeChange(event.target.value);
      }}
    >
      {Object.entries(themeLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  </label>
);
