import { css } from "lit";

export const dialogStyles = css`
  :host {
    --mdc-theme-primary: var(--improv-primary-color, #03a9f4);
    --mdc-theme-on-primary: var(--improv-on-primary-color, #fff);
    --improv-danger-color: #db4437;
    --improv-text-color: rgba(0, 0, 0, 0.6);
    --mdc-theme-text-primary-on-background: var(--improv-text-color);
    --mdc-dialog-content-ink-color: var(--improv-text-color);
    text-align: left;
  }

  a {
    color: var(--improv-primary-color, #03a9f4);
  }
`;
