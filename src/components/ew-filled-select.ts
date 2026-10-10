import { FilledSelect } from "@material/web/select/internal/filled-select.js";
import { styles } from "@material/web/select/internal/filled-select-styles.cssresult.js";
import { styles as sharedStyles } from "@material/web/select/internal/shared-styles.cssresult.js";

declare global {
  interface HTMLElementTagNameMap {
    "ew-filled-select": EwFilledSelect;
  }
}

export class EwFilledSelect extends FilledSelect {
  static override styles = [sharedStyles, styles];
}

customElements.define("ew-filled-select", EwFilledSelect);
