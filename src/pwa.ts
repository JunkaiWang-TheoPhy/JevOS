import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwa() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches);
  const prompt = useRef<InstallPrompt | null>(null);
  const updater = useRef<(reload?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    // Development deliberately stays free of service workers and stale precaches.
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      updater.current = registerSW({
        onOfflineReady: () => setOfflineReady(true),
        onNeedRefresh: () => setNeedRefresh(true),
        onRegisterError: () => setOfflineReady(false),
      });
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      setCanInstall(true);
    };
    const onInstalled = () => {
      prompt.current = null;
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    const event = prompt.current;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    prompt.current = null;
    setCanInstall(false);
  }

  return { offlineReady, needRefresh, canInstall, installed, install,
    update: () => updater.current(true) };
}
