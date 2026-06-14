'use client';

import { useState, useEffect } from 'react';

const themes = [
  { id: 'black-orange', bg: '#141416', accent: '#C97010' },
  { id: 'black-green',  bg: '#101712', accent: '#1AB870' },
  { id: 'white-orange', bg: '#F6F3EE', accent: '#B85C00' },
  { id: 'white-green',  bg: '#F2F7F4', accent: '#0D8C4A' },
];

export default function ThemeSwitcher() {
  const [active, setActive] = useState('black-orange');

  useEffect(() => {
    const saved = localStorage.getItem('es-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      setActive(saved);
    }
  }, []);

  const setTheme = (id) => {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('es-theme', id);
    setActive(id);
  };

  return (
    <div className="flex items-center gap-1 bg-[var(--bg2)] border border-[var(--line)] rounded-full px-1.5 py-1">
      {themes.map(t => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110
            ${active === t.id ? 'border-[var(--ink)]' : 'border-transparent'}`}
          style={{
            background: `radial-gradient(circle at 38% 38%, ${t.accent} 46%, ${t.bg} 48%)`,
          }}
        />
      ))}
    </div>
  );
}
