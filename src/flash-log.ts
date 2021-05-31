import { css, html, HTMLTemplateResult, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

interface Row {
  id?: string;
  content: HTMLTemplateResult | string;
  error?: boolean;
  action?: boolean;
}

@customElement("esphome-web-flash-log")
class FlashLog extends LitElement {
  @state() _rows: Row[] = [];

  protected render() {
    return html`${this._rows.map(
      (row) =>
        html`<div
          class=${classMap({
            error: row.error === true,
            action: row.action === true,
          })}
        >
          ${row.content}
        </div>`
    )}`;
  }

  /**
   * Add or replace a row.
   */
  public addRow(row: Row) {
    // If last entry has same ID, replace it.
    if (
      row.id &&
      this._rows.length > 0 &&
      this._rows[this._rows.length - 1].id === row.id
    ) {
      const newRows = this._rows.slice(0, -1);
      newRows.push(row);
      this._rows = newRows;
    } else {
      this._rows = [...this._rows, row];
    }
  }

  /**
   * Add an error row
   */
  public addError(content: Row["content"]) {
    this.addRow({ content, error: true });
  }

  /**
   * Remove last row if ID matches
   */
  public removeRow(id: string) {
    if (this._rows.length > 0 && this._rows[this._rows.length - 1].id === id) {
      this._rows = this._rows.slice(0, -1);
    }
  }

  static styles = css`
    :host {
      display: block;
      max-width: 500px;
      font-family: monospace;
      background-color: black;
      color: greenyellow;
      font-size: 14px;
      line-height: 19px;
      padding: 12px 16px;
    }

    button {
      background: none;
      color: inherit;
      border: none;
      padding: 0;
      font: inherit;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }

    .action,
    .error {
      margin-top: 1em;
    }

    .error {
      color: red;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-web-flash-log": FlashLog;
  }
}
