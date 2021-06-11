import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { FlashState, State } from "./const";
import "@material/mwc-linear-progress";
import { classMap } from "lit/directives/class-map.js";

@customElement("esp-web-flash-progress")
export class FlashProgress extends LitElement {
  @state() private _state?: FlashState;

  @state() private _indeterminate = true;

  @state() private _progress = 0;

  @state() private _buffer = 1;

  public processState(state: FlashState) {
    this._state = state;
    if (this._state.state === State.WRITING) {
      this._indeterminate = false;
      this._progress = this._state.details.percentage / 100;
    }
    if (this._state.state === State.ERROR) {
      this._indeterminate = false;
    }
  }

  public clear() {
    this._state = undefined;
    this._progress = 0;
    this._buffer = 1;
    this._indeterminate = true;
  }

  protected render() {
    if (!this._state) {
      return;
    }
    return html`<h2
        class=${classMap({
          error: this._state.state === State.ERROR,
          done: this._state.state === State.FINISHED,
        })}
      >
        ${this._state.message}
      </h2>
      <mwc-linear-progress
        class=${classMap({
          error: this._state.state === State.ERROR,
          done: this._state.state === State.FINISHED,
        })}
        .indeterminate=${this._indeterminate}
        .progress=${this._progress}
        .buffer=${this._buffer}
      ></mwc-linear-progress>`;
  }

  static styles = css`
    :host {
      display: block;
      --mdc-theme-primary: var(--progress-color, #03a9f4);
    }
    .error {
      color: var(--error-color, #dc3545);
      --mdc-theme-primary: var(--error-color, #dc3545);
    }
    .done {
      color: var(--success-color, #28a745);
      --mdc-theme-primary: var(--success-color, #28a745);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "esp-web-flash-progress": FlashProgress;
  }
}
