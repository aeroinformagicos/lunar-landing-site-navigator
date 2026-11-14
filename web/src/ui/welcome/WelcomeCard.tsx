// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Welcome card over the main view (14_ux_malaga.md §1): the demo pair is already loaded behind it,
// one primary action (`Take the 60-second tour`, Learn step 1) and `Explore on my own`.
import { useEffect, useRef } from 'react';
import { t } from '../../i18n/t';
import { useAppStore } from '../../state/store';
import { Button } from '../common/Button';
import { rememberWelcomeClosed } from './welcome';

export function WelcomeCard({ onClose }: { onClose: () => void }) {
  const tourRef = useRef<HTMLButtonElement>(null);
  useEffect(() => tourRef.current?.focus({ preventScroll: true }), []);

  function close() {
    rememberWelcomeClosed();
    onClose();
  }
  function tour() {
    close();
    useAppStore.setState({ storyStep: 0 });
    useAppStore.getState().setMode('learn');
  }

  return (
    <section className="welcome" role="region" aria-labelledby="welcome-title" data-testid="welcome">
      <div className="welcome__card">
        <h2 id="welcome-title" className="welcome__title">
          {t('welcome.title')}
        </h2>
        <p className="welcome__body">{t('welcome.body')}</p>
        <div className="welcome__actions">
          <Button variant="primary" ref={tourRef} onClick={tour}>
            {t('welcome.tour')}
          </Button>
          <Button variant="ghost" onClick={close}>
            {t('welcome.explore')}
          </Button>
        </div>
      </div>
    </section>
  );
}
