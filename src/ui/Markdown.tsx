import type { ReactNode } from "react";

/**
 * Minimal markdown renderer that emits React elements.
 *
 * Deliberately NOT using dangerouslySetInnerHTML: the input is model output,
 * which is untrusted enough that injecting raw HTML would be an XSS hole.
 * Building nodes directly makes that class of bug impossible.
 *
 * Supports: headings, bold, italic, inline code, fenced code, links, bullet
 * and numbered lists, blockquotes, horizontal rules, and pipe tables.
 */

// ---------- inline ----------

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(\[[^\]\n]+?\]\([^)\s]+?\))|(\*[^*\n]+?\*)|(_[^_\n]+?_)|(~~[^~\n]+?~~)/;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const k = `${key}-${n++}`;

    if (tok.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="px-1.5 py-0.5 rounded-md bg-[var(--color-surface-2)] text-[0.9em] font-mono"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(
        <strong key={k} className="font-semibold">
          {inline(tok.slice(2, -2), k)}
        </strong>,
      );
    } else if (tok.startsWith("~~")) {
      out.push(
        <del key={k} className="opacity-60">
          {inline(tok.slice(2, -2), k)}
        </del>,
      );
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      const safe = /^(https?:|mailto:)/i.test(href) ? href : undefined;
      out.push(
        safe ? (
          <a
            key={k}
            href={safe}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-accent-ink)] underline underline-offset-2"
          >
            {inline(label, k)}
          </a>
        ) : (
          // Refuse javascript: and other schemes — render as plain text.
          <span key={k}>{label}</span>
        ),
      );
    } else {
      out.push(
        <em key={k} className="italic">
          {inline(tok.slice(1, -1), k)}
        </em>,
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

// ---------- block ----------

const H = /^(#{1,6})\s+(.*)$/;
const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HR = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  const push = (n: ReactNode) => out.push(<div key={k++}>{n}</div>);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      push(
        <pre className="my-2 p-3 rounded-xl bg-[var(--color-surface-2)] overflow-x-auto text-[13px] font-mono leading-relaxed">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (HR.test(line)) {
      push(<hr className="my-4 border-[var(--color-line)]" />);
      i++;
      continue;
    }

    const h = H.exec(line);
    if (h) {
      const level = h[1].length;
      const size =
        level <= 1 ? "text-[19px]" : level === 2 ? "text-[17px]" : "text-[15px]";
      push(
        <p className={`${size} font-semibold mt-4 mb-1.5 first:mt-0 leading-snug`}>
          {inline(h[2], `h${k}`)}
        </p>,
      );
      i++;
      continue;
    }

    // table
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const cells = (r: string) =>
        r
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i++]));
      }
      push(
        <div className="my-2 overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr>
                {head.map((c, x) => (
                  <th
                    key={x}
                    className="text-left font-semibold border-b border-[var(--color-line)] py-1.5 pr-3 align-top"
                  >
                    {inline(c, `th${x}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, y) => (
                <tr key={y}>
                  {r.map((c, x) => (
                    <td
                      key={x}
                      className="border-b border-[var(--color-line)] py-1.5 pr-3 align-top"
                    >
                      {inline(c, `td${y}-${x}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // blockquote
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      push(
        <blockquote className="my-2 pl-3 border-l-2 border-[var(--color-line)] text-[var(--color-muted)]">
          {inline(body.join(" "), `q${k}`)}
        </blockquote>,
      );
      continue;
    }

    // lists
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const items: { indent: number; text: string; marker: string }[] = [];
      while (i < lines.length) {
        const u = UL.exec(lines[i]);
        const o = OL.exec(lines[i]);
        if (u) items.push({ indent: u[1].length, text: u[2], marker: "•" });
        else if (o) items.push({ indent: o[1].length, text: o[3], marker: `${o[2]}.` });
        else if (lines[i].trim() === "" && (UL.test(lines[i + 1] ?? "") || OL.test(lines[i + 1] ?? "")))
          { /* blank line inside a list */ }
        else break;
        i++;
      }
      push(
        <ul className={`my-2 space-y-1.5 ${ordered ? "" : ""}`}>
          {items.map((it, x) => (
            <li
              key={x}
              className="flex gap-2"
              style={{ paddingLeft: Math.min(it.indent, 8) * 2 }}
            >
              <span className="shrink-0 text-[var(--color-muted)] tabular-nums min-w-[1.1em]">
                {it.marker}
              </span>
              <span className="flex-1">{inline(it.text, `li${x}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !H.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !/^\s*```/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    push(<p className="my-2 first:mt-0 leading-relaxed">{inline(para.join(" "), `p${k}`)}</p>);
  }

  return <div className="[&>div:first-child>*]:mt-0">{out}</div>;
}
