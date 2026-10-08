import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { initialTheme, applyTheme, THEME_KEY } from '../features/theme/theme.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => applyTheme(theme), [theme]);
  function select(next) {
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Keep the current session usable. */ }
  }
  return <div className="theme-toggle" role="group" aria-label="Colour theme">
    {['light', 'dark'].map(value => <button key={value} type="button" aria-label={`${value === 'light' ? 'Light' : 'Dark'} mode`} aria-pressed={theme === value} onClick={() => select(value)}>{value === "light" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button>)}
  </div>;
}
