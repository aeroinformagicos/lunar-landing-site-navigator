// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// App shell: loads config, manifest and sites (T-11), builds the initial state from
// `sites.json.defaults` and renders the layout (T-14) or, on `#/validation`, the validation page (T-23).
import { useEffect, useState } from 'react';
import { DataError, loader } from './core/loaders';
import { t } from './i18n/t';
import { useAppStore } from './state/store';
import { BootContext } from './ui/common/data';
import { DataState, useResource } from './ui/common/DataState';
import { AppLayout } from './ui/layout/AppLayout';
import { routeOf } from './ui/validation/report';
import { ValidationPage } from './ui/validation/ValidationPage';

function bootError(error: Error): string {
  return error instanceof DataError && (error.kind === 'contract' || error.kind === 'format')
    ? t('error.contract')
    : t('error.boot');
}

function useRoute(): 'validation' | 'main' {
  const [route, setRoute] = useState(() => routeOf(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(routeOf(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const [boot, retry] = useResource('boot', () => loader.loadBoot());
  const init = useAppStore((s) => s.init);
  const initialised = useAppStore((s) => s.initialised);

  useEffect(() => {
    if (boot.status === 'ready' && !initialised) init(boot.data.sites.defaults);
  }, [boot, initialised, init]);

  const synthetic = boot.status === 'ready' && boot.data.manifest.ephemeris.synthetic;

  return (
    <div className="app">
      {synthetic && (
        <div className="banner banner--example" role="note">
          {t('banner.example')}
        </div>
      )}
      <DataState resource={boot} errorText={bootError} onRetry={retry} className="app__boot">
        {(data) =>
          initialised ? (
            <BootContext.Provider value={data}>
              {route === 'validation' ? <ValidationPage /> : <AppLayout />}
            </BootContext.Provider>
          ) : null
        }
      </DataState>
      <footer className="app__footer">
        <p>{t('footer.credit')}</p>
        <p>{t('about.ai')}</p>
      </footer>
    </div>
  );
}
