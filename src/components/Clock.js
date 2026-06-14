'use client';

import { useState, useEffect } from 'react';

export default function Clock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleString('en-ZA', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="font-mono text-xs text-[var(--ink3)]">{time}</span>;
}
