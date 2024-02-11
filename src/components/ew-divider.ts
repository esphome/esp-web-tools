import { Divider } from "@material/web/divider/internal/divider.js";
import { styles } from "@material/web/divider/internal/divider-styles.css.js";

declare global {
  interface HTMLElementTagNameMap {
    "ew-divider": EwDivider;
  }
}

export class EwDivider extends Divider {
  static override styles = [styles];
}

customElements.define("ew-divider", EwDivider);
