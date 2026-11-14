// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// The four states of every data view (10_interfaz.md §9): loading, empty, error (+ Retry), ready.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Resource } from '../../core/types';
import { t } from '../../i18n/t';

/**
 * Runs `load` when `key` changes and tracks its state. `retry()` runs it again (the loader does not
 * cache failures). `key = null` leaves the resource idle (nothing to load yet).
 */
export function useResource<T>(key: string | null, load: () => Promise<T>): [Resource<T>, () => void] {
  const [state, setState] = useState<Resource<T>>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) {
      setState({ status: 'idle' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (error: Error) => alive && setState({ status: 'error', error }),
    );
    return () => {
      alive = false;
    };
    // `load` is recreated on every render; `key` identifies the resource.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [state, retry];
}

export interface DataStateProps<T> {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
  /** Text under the skeleton; default `Loading…`. */
  loadingText?: string;
  /** Error message; may depend on the error (e.g. contract version). */
  errorText?: string | ((error: Error) => string);
  onRetry?: () => void;
  /** Ready data that counts as empty shows `emptyText` (and `emptyAction`) instead. */
  isEmpty?: (data: T) => boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  className?: string;
}

export function DataState<T>(props: DataStateProps<T>) {
  const { resource, children, className } = props;
  const cls = (state: string) => ['data-state', `data-state--${state}`, className].filter(Boolean).join(' ');

  switch (resource.status) {
    case 'idle':
    case 'loading':
      return (
        <div className={cls('loading')} role="status" aria-live="polite" aria-busy="true">
          <div className="skeleton" aria-hidden="true" />
          <p>{props.loadingText ?? t('common.loading')}</p>
        </div>
      );
    case 'error': {
      const { errorText } = props;
      const message =
        typeof errorText === 'function' ? errorText(resource.error) : (errorText ?? resource.error.message);
      return (
        <div className={cls('error')} role="alert">
          <p>{message}</p>
          {props.onRetry && (
            <button type="button" onClick={props.onRetry}>
              {t('common.retry')}
            </button>
          )}
        </div>
      );
    }
    case 'ready':
      if (props.isEmpty?.(resource.data)) {
        return (
          <div className={cls('empty')}>
            <p>{props.emptyText}</p>
            {props.emptyAction}
          </div>
        );
      }
      return <>{children(resource.data)}</>;
  }
}
