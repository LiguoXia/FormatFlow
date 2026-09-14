import { useLayoutEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Appearance = 'light' | 'dark' | 'system';
const choices = [
  {id: 'light', label: '浅色', icon: Sun},
  {id: 'dark', label: '深色', icon: Moon},
  {id: 'system', label: '系统', icon: Monitor},
] as const;

export default function AppearanceControl() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try {
      const saved = localStorage.getItem('formatflow.appearance');
      return saved === 'dark' || saved === 'system' ? saved : 'light';
    } catch { return 'light'; }
  });
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = appearance === 'system' ? (media.matches ? 'dark' : 'light') : appearance;
    };
    apply();
    try { localStorage.setItem('formatflow.appearance', appearance); } catch { /* Preferences are optional. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [appearance]);
  return <div className="appearance-control">
    <span className="sidebar-label">外观</span>
    <div className="segmented appearance-options" role="group" aria-label="外观">
      {choices.map(({id, label, icon: Icon}) => <button key={id} className={appearance === id ? 'active' : ''} aria-pressed={appearance === id} aria-label={`${label}外观`} title={id === 'system' ? '跟随系统外观' : `${label}外观`} onClick={() => setAppearance(id)}><Icon size={14} /><span>{label}</span></button>)}
    </div>
  </div>;
}
