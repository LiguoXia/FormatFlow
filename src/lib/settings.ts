import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from './customTypes';
export function useIndent(key: keyof AppSettings, fallback = 2) {
  const [indent, setValue] = useState(fallback);
  const [settingsError, setError] = useState('');
  const changed = useRef(false);
  useEffect(() => {
    let active = true;
    window.desktop?.settings.read().then(settings => { if(active && !changed.current)setValue(settings[key]); }).catch(error => {if(active)setError('读取缩进设置失败：' + error.message);});
    return () => {active=false;};
  }, [key]);
  function setIndent(value: number) {
    changed.current=true; setValue(value);setError('');
    window.desktop?.settings.write({[key]:value}).catch(error => setError('保存缩进设置失败：' + error.message));
  }
  return {indent,setIndent,settingsError};
}
