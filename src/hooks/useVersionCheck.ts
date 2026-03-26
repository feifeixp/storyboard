import { useEffect, useState } from 'react';

export const useVersionCheck = (intervalMs = 5 * 60 * 1000) => {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    // Only run if the app is built with __APP_VERSION__ defined
    if (typeof __APP_VERSION__ === 'undefined') return;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.version && data.version !== __APP_VERSION__) {
          setHasUpdate(true);
        }
      } catch (err) {
        // silently ignore fetch errors
      }
    };

    const intervalId = setInterval(checkVersion, intervalMs);
    
    const handleFocus = () => checkVersion();
    window.addEventListener('focus', handleFocus);

    // Initial check (useful after long background state before focus is fired)
    checkVersion();

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [intervalMs]);

  return hasUpdate;
};
