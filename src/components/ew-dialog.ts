import { Dialog } from "@material/web/dialog/internal/dialog.js";
import { styles } from "@material/web/dialog/internal/dialog-styles.css";
import { css } from "lit";

declare global {
  interface HTMLElementTagNameMap {
    "ew-dialog": EwtDialog;
  }
}

export class EwtDialog extends Dialog {
  static override styles = [
    styles,
    css`
      .mdc-dialog__title {
        padding-right: 52px;
      }
    `,
  ];
}

customElements.define("ew-dialog", EwtDialog);
