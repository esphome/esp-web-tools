import { styles } from "@material/web/menu/internal/menuitem/menu-item-styles.css.js";
import { SelectOptionEl } from "@material/web/select/internal/selectoption/select-option.js";

declare global {
  interface HTMLElementTagNameMap {
    "ew-select-option": EwSelectOption;
  }
}

export class EwSelectOption extends SelectOptionEl {
  static override styles = [styles];
}

customElements.define("ew-select-option", EwSelectOption);
