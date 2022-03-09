import { SelectBase } from "@material/mwc-select/mwc-select-base";
import { styles } from "@material/mwc-select/mwc-select.css";

declare global {
  interface HTMLElementTagNameMap {
    "ewt-select": EwtSelect;
  }
}

export class EwtSelect extends SelectBase {
  static override styles = [styles];
}

customElements.define("ewt-select", EwtSelect);
