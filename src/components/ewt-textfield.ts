import { TextFieldBase } from "@material/mwc-textfield/mwc-textfield-base";
import { styles } from "@material/mwc-textfield/mwc-textfield.css";

declare global {
  interface HTMLElementTagNameMap {
    "ewt-textfield": EwtTextfield;
  }
}

export class EwtTextfield extends TextFieldBase {
  static override styles = [styles];
}

customElements.define("ewt-textfield", EwtTextfield);
