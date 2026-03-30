"use client";

import { useState, useCallback } from "react";
import History from "./History";

type Op = "+" | "-" | "*" | "/" | null;

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [reset, setReset] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const input = useCallback((digit: string) => {
    setDisplay((d) => {
      if (reset || d === "0") {
        setReset(false);
        return digit;
      }
      return d + digit;
    });
  }, [reset]);

  const decimal = useCallback(() => {
    setDisplay((d) => {
      if (reset) { setReset(false); return "0."; }
      return d.includes(".") ? d : d + ".";
    });
  }, [reset]);

  const operate = useCallback((nextOp: Op) => {
    const current = parseFloat(display);
    if (prev !== null && op && !reset) {
      let result: number;
      switch (op) {
        case "+": result = prev + current; break;
        case "-": result = prev - current; break;
        case "*": result = prev * current; break;
        case "/": result = current === 0 ? NaN : prev / current; break;
        default: result = current;
      }
      const expr = `${prev} ${op} ${current} = ${isNaN(result) ? "Error" : result}`;
      setHistory((h) => [expr, ...h].slice(0, 20));
      setDisplay(isNaN(result) ? "Error" : String(result));
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setReset(true);
  }, [display, prev, op, reset]);

  const equals = useCallback(() => {
    operate(null);
  }, [operate]);

  const clear = useCallback(() => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setReset(false);
  }, []);

  const percent = useCallback(() => {
    setDisplay((d) => String(parseFloat(d) / 100));
  }, []);

  const negate = useCallback(() => {
    setDisplay((d) => d === "0" ? d : String(-parseFloat(d)));
  }, []);

  const btn = (label: string, onClick: () => void, style?: React.CSSProperties) => (
    <button
      onClick={onClick}
      style={{
        width: 64, height: 64, borderRadius: 32, border: "none", fontSize: 20,
        cursor: "pointer", fontWeight: 500,
        background: "#505050", color: "#fff",
        ...style,
      }}
    >
      {label}
    </button>
  );

  const opBtn = (label: string, thisOp: Op) =>
    btn(label, () => operate(thisOp), {
      background: op === thisOp && reset ? "#fff" : "#f09a36",
      color: op === thisOp && reset ? "#f09a36" : "#fff",
    });

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ width: 288, background: "#2a2a3e", borderRadius: 16, padding: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        <div style={{
          textAlign: "right", color: "#fff", fontSize: display.length > 9 ? 32 : 48,
          fontWeight: 300, padding: "16px 8px", minHeight: 64, lineHeight: "64px",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {display}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 64px)", gap: 8, justifyContent: "center" }}>
          {btn("AC", clear, { background: "#a0a0a0", color: "#000" })}
          {btn("+/-", negate, { background: "#a0a0a0", color: "#000" })}
          {btn("%", percent, { background: "#a0a0a0", color: "#000" })}
          {opBtn("÷", "/")}

          {btn("7", () => input("7"))}
          {btn("8", () => input("8"))}
          {btn("9", () => input("9"))}
          {opBtn("×", "*")}

          {btn("4", () => input("4"))}
          {btn("5", () => input("5"))}
          {btn("6", () => input("6"))}
          {opBtn("−", "-")}

          {btn("1", () => input("1"))}
          {btn("2", () => input("2"))}
          {btn("3", () => input("3"))}
          {opBtn("+", "+")}

          <button
            onClick={() => input("0")}
            style={{
              gridColumn: "span 2", height: 64, borderRadius: 32, border: "none",
              fontSize: 20, cursor: "pointer", background: "#505050", color: "#fff",
              textAlign: "left", paddingLeft: 24, fontWeight: 500,
            }}
          >0</button>
          {btn(".", decimal)}
          {btn("=", equals, { background: "#f09a36", color: "#fff" })}
        </div>
      </div>
      <History entries={history} />
    </div>
  );
}
