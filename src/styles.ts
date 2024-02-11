import { css } from "lit";

// We set font-size to 16px and all the mdc typography styles
// because it defaults to rem, which means that the font-size
// of the host website would influence the ESP Web Tools dialog.

export const dialogStyles = css`
  :host {
    --roboto-font: Roboto, system-ui;
    --text-color: rgba(0, 0, 0, 0.6);
    --danger-color: #db4437;

    --md-sys-color-primary: #03a9f4;
    --md-sys-color-on-primary: #fff;
    --md-ref-typeface-brand: var(--roboto-font);
    --md-ref-typeface-plain: var(--roboto-font);

    --md-sys-typescale-headline-font: var(--roboto-font);
    --md-sys-typescale-title-font: var(--roboto-font);

    --mdc-theme-primary: var(--md-sys-color-primary);
    --mdc-theme-on-primary: var(--md-sys-color-on-primary);
    --mdc-theme-text-primary-on-background: var(--text-color);
    --mdc-dialog-content-ink-color: var(--text-color);
    text-align: left;
    font-size: 16px;
    --mdc-typography-headline6-font-size: 1.25em;
    --mdc-typography-headline6-line-height: 2em;
    --mdc-typography-body1-font-size: 1em;
    --mdc-typography-body1-line-height: 1.5em;
    --mdc-typography-button-font-size: 0.875em;
    --mdc-typography-button-line-height: 2.25em;
    --mdc-typography-subtitle1-font-size: 1em;
    --mdc-typography-subtitle1-line-height: 1.75em;
  }

  a {
    color: var(--md-sys-color-primary, #03a9f4);
  }

  a.button {
    text-decoration: none;
  }
`;
