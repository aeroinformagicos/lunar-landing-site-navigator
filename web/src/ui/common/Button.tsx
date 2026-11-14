// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// The single button of the app (14_ux_malaga.md §3): `primary` (filled, one per screen), `secondary`
// (outline) and `ghost` (text only). Every variant is at least 44 × 44 px (14 §6); views pass a
// variant, never their own button styles.
import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
}

/** Class names of a variant, also for links that look like buttons (`<a className={buttonClass()}>`). */
export function buttonClass(variant: ButtonVariant = 'secondary', extra?: string): string {
  return `btn btn--${variant}${extra ? ` ${extra}` : ''}`;
}

export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}
