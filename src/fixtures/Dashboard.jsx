import React from "react";

function StatCard({ title, value, change, icon }) {
  const isPositive = change >= 0;
  return (
    <div style={{ padding: 16, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#666" }}>{title}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: isPositive ? "#22c55e" : "#ef4444", marginTop: 4 }}>
        {isPositive ? "+" : ""}{change}% from last month
      </div>
    </div>
  );
}

function TableRow({ cells, isHeader }) {
  const Tag = isHeader ? "th" : "td";
  return (
    <tr>
      {cells.map((cell, i) => (
        <Tag key={i} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #eee", fontWeight: isHeader ? 600 : 400, background: isHeader ? "#f9fafb" : "transparent" }}>
          {cell}
        </Tag>
      ))}
    </tr>
  );
}

function DataTable({ headers, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <thead><TableRow cells={headers} isHeader={true} /></thead>
      <tbody>{rows.map((row, i) => <TableRow key={i} cells={row} isHeader={false} />)}</tbody>
    </table>
  );
}

function Sidebar() {
  const items = ["Overview", "Analytics", "Reports", "Users", "Settings"];
  return (
    <nav style={{ width: 200, borderRight: "1px solid #eee", padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Navigation</h3>
      {items.map((item, i) => (
        <a key={i} href="#" style={{ padding: "8px 12px", borderRadius: 6, background: i === 0 ? "#f0f7ff" : "transparent", color: i === 0 ? "#0070f3" : "#333", textDecoration: "none", fontSize: 14 }}>{item}</a>
      ))}
    </nav>
  );
}

function ActivityItem({ user, action, time }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ width: 32, height: 32, borderRadius: 16, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "#4f46e5" }}>
        {user[0]}
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 500 }}>{user}</span> <span style={{ color: "#666" }}>{action}</span>
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{time}</div>
      </div>
    </div>
  );
}

const stats = [
  { title: "Revenue", value: "$45,231", change: 12.5, icon: "\u{1F4B0}" },
  { title: "Users", value: "2,338", change: 8.2, icon: "\u{1F465}" },
  { title: "Orders", value: "1,234", change: -2.4, icon: "\u{1F4E6}" },
  { title: "Growth", value: "23.1%", change: 4.1, icon: "\u{1F4C8}" },
];

const tableHeaders = ["Name", "Email", "Role", "Status", "Last Active"];
const tableRows = Array.from({ length: 20 }, (_, i) => [
  `User ${i + 1}`,
  `user${i + 1}@example.com`,
  i % 3 === 0 ? "Admin" : i % 3 === 1 ? "Editor" : "Viewer",
  i % 4 === 0 ? "Inactive" : "Active",
  `${Math.floor(Math.random() * 24)}h ago`,
]);

const activities = Array.from({ length: 8 }, (_, i) => ({
  user: ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank"][i],
  action: ["deployed v2.3", "merged PR #42", "updated config", "fixed bug #17", "added feature", "reviewed code", "ran migration", "updated docs"][i],
  time: `${i + 1}h ago`,
}));

export default function Dashboard() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui", background: "#f9fafb" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {stats.map((s, i) => <StatCard key={i} {...s} />)}
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: 2 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Users</h2>
            <DataTable headers={tableHeaders} rows={tableRows} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent Activity</h2>
            <div style={{ background: "#fff", borderRadius: 8, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              {activities.map((a, i) => <ActivityItem key={i} {...a} />)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
