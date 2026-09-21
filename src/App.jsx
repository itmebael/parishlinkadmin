import React from "react";

// The live admin dashboard (Parish administration,
// bookings, events, announcements, parish records, etc.) is compiled into
// dist/assets/index-v<timestamp>.js and is loaded from dist/index.html.
//
// During development we embed that built dashboard in an iframe so the full
// application is visible while we work on SQL and shared features.
export default function App() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "#f6f7f3",
      }}
    >
      <iframe
        title="DioLink Admin Portal"
        src="/dist/index.html"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          background: "transparent",
        }}
      />
    </main>
  );
}
