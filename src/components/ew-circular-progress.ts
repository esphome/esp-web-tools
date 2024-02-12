import { CircularProgress } from "@material/web/progress/internal/circular-progress.js";
import { styles } from "@material/web/progress/internal/circular-progress-styles.css.js";

declare global {
  interface HTMLElementTagNameMap {
    "ew-circular-progress": EwCircularProgress;
  }
}

export class EwCircularProgress extends CircularProgress {
  static override styles = [styles];
}

customElements.define("ew-circular-progress", EwCircularProgress);
