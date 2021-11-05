import { DialogBase } from "@material/mwc-dialog/mwc-dialog-base";
import { styles } from "@material/mwc-dialog/mwc-dialog.css";

declare global {
  interface HTMLElementTagNameMap {
    "ewt-dialog": EwtDialog;
  }
}

export class EwtDialog extends DialogBase {
  static override styles = [styles];
}

customElements.define("ewt-dialog", EwtDialog);
