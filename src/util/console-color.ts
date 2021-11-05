interface ConsoleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  foregroundColor: string | null;
  backgroundColor: string | null;
  carriageReturn: boolean;
  secret: boolean;
}

export class ColoredConsole {
  public state: ConsoleState = {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    foregroundColor: null,
    backgroundColor: null,
    carriageReturn: false,
    secret: false,
  };

  constructor(public targetElement: HTMLElement) {}

  addLine(line: string) {
    const re = /(?:\033|\\033)(?:\[(.*?)[@-~]|\].*?(?:\007|\033\\))/g;
    let i = 0;

    if (this.state.carriageReturn) {
      if (line !== "\n") {
        // don't remove if \r\n
        this.targetElement.removeChild(this.targetElement.lastChild!);
      }
      this.state.carriageReturn = false;
    }

    if (line.includes("\r")) {
      this.state.carriageReturn = true;
    }

    const lineSpan = document.createElement("span");
    lineSpan.classList.add("line");
    this.targetElement.appendChild(lineSpan);

    const addSpan = (content: string) => {
      if (content === "") return;

      const span = document.createElement("span");
      if (this.state.bold) span.classList.add("log-bold");
      if (this.state.italic) span.classList.add("log-italic");
      if (this.state.underline) span.classList.add("log-underline");
      if (this.state.strikethrough) span.classList.add("log-strikethrough");
      if (this.state.secret) span.classList.add("log-secret");
      if (this.state.foregroundColor !== null)
        span.classList.add(`log-fg-${this.state.foregroundColor}`);
      if (this.state.backgroundColor !== null)
        span.classList.add(`log-bg-${this.state.backgroundColor}`);
      span.appendChild(document.createTextNode(content));
      lineSpan.appendChild(span);

      if (this.state.secret) {
        const redacted = document.createElement("span");
        redacted.classList.add("log-secret-redacted");
        redacted.appendChild(document.createTextNode("[redacted]"));
        lineSpan.appendChild(redacted);
      }
    };

    while (true) {
      const match = re.exec(line);
      if (match === null) break;

      const j = match.index;
      addSpan(line.substring(i, j));
      i = j + match[0].length;

      if (match[1] === undefined) continue;

      for (const colorCode of match[1].split(";")) {
        switch (parseInt(colorCode)) {
          case 0:
            // reset
            this.state.bold = false;
            this.state.italic = false;
            this.state.underline = false;
            this.state.strikethrough = false;
            this.state.foregroundColor = null;
            this.state.backgroundColor = null;
            this.state.secret = false;
            break;
          case 1:
            this.state.bold = true;
            break;
          case 3:
            this.state.italic = true;
            break;
          case 4:
            this.state.underline = true;
            break;
          case 5:
            this.state.secret = true;
            break;
          case 6:
            this.state.secret = false;
            break;
          case 9:
            this.state.strikethrough = true;
            break;
          case 22:
            this.state.bold = false;
            break;
          case 23:
            this.state.italic = false;
            break;
          case 24:
            this.state.underline = false;
            break;
          case 29:
            this.state.strikethrough = false;
            break;
          case 30:
            this.state.foregroundColor = "black";
            break;
          case 31:
            this.state.foregroundColor = "red";
            break;
          case 32:
            this.state.foregroundColor = "green";
            break;
          case 33:
            this.state.foregroundColor = "yellow";
            break;
          case 34:
            this.state.foregroundColor = "blue";
            break;
          case 35:
            this.state.foregroundColor = "magenta";
            break;
          case 36:
            this.state.foregroundColor = "cyan";
            break;
          case 37:
            this.state.foregroundColor = "white";
            break;
          case 39:
            this.state.foregroundColor = null;
            break;
          case 41:
            this.state.backgroundColor = "red";
            break;
          case 42:
            this.state.backgroundColor = "green";
            break;
          case 43:
            this.state.backgroundColor = "yellow";
            break;
          case 44:
            this.state.backgroundColor = "blue";
            break;
          case 45:
            this.state.backgroundColor = "magenta";
            break;
          case 46:
            this.state.backgroundColor = "cyan";
            break;
          case 47:
            this.state.backgroundColor = "white";
            break;
          case 40:
          case 49:
            this.state.backgroundColor = null;
            break;
        }
      }
    }
    addSpan(line.substring(i));

    if (
      this.targetElement.scrollTop + 56 >=
      this.targetElement.scrollHeight - this.targetElement.offsetHeight
    ) {
      // at bottom
      this.targetElement.scrollTop = this.targetElement.scrollHeight;
    }
  }
}
