"use client";

export default function History({ entries }: { entries: string[] }) {
  if (entries.length === 0) return null;

  return (
    <div style={{
      width: 220, background: "#2a2a3e", borderRadius: 16, padding: 16,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxHeight: 400, overflowY: "auto",
    }}>
      <h3 style={{ margin: "0 0 12px", color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
        History
      </h3>
      {entries.map((entry, i) => (
        <div key={i} style={{
          padding: "6px 0", borderBottom: i < entries.length - 1 ? "1px solid #3a3a4e" : "none",
          color: i === 0 ? "#fff" : "#666", fontSize: 13, fontFamily: "monospace",
        }}>
          {entry}
        </div>
      ))}
    </div>
  );
}
