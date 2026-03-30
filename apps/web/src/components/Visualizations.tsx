import { useEffect, useState } from "react";

export function SpendChart({ percent }: { percent: number }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  return (
    <div className="viz-container">
      <svg className="viz-chart" viewBox="0 0 400 120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--obsidian-accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--obsidian-accent)" stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <path 
          d="M 0 100 Q 50 110, 100 80 T 200 60 T 300 40 T 400 10 L 400 120 L 0 120 Z" 
          fill="url(#spendGrad)" 
          style={{ transition: "all 1s ease-in-out", opacity: loaded ? 1 : 0 }}
        />
        <path 
          className="viz-line" 
          d="M 0 100 Q 50 110, 100 80 T 200 60 T 300 40 T 400 10" 
          filter="url(#glow)"
          style={{ 
            strokeDasharray: 1000, 
            strokeDashoffset: loaded ? 0 : 1000, 
            transition: "stroke-dashoffset 2s ease-in-out" 
          }}
        />
        {[
          { cx: 100, cy: 80 },
          { cx: 200, cy: 60 },
          { cx: 300, cy: 40 },
          { cx: 400, cy: 10 }
        ].map((pt, i) => (
          <circle 
            key={i}
            className="viz-point" 
            cx={pt.cx} cy={pt.cy} r="4" 
            fill="var(--obsidian-accent)"
            style={{ 
              opacity: loaded ? 1 : 0, 
              transition: `opacity 0.5s ease-in-out ${0.5 + i * 0.2}s` 
            }}
          />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.7rem", color: "#666", fontFamily: "monospace" }}>
        <span>T-30D</span>
        <span>CURRENT EXHAUSTION: {percent}%</span>
        <span>LIVE</span>
      </div>
    </div>
  );
}

export function TaskDistributionChart({ pending, active, completed }: { pending: number, active: number, completed: number }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  const total = pending + active + completed || 1;
  const pPending = (pending / total) * 100;
  const pActive = (active / total) * 100;
  const pCompleted = (completed / total) * 100;

  return (
    <div className="viz-container" style={{ flexDirection: "column", alignItems: "stretch", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", height: "120px", gap: "1.5rem", justifyContent: "space-between", padding: "0 1rem" }}>
        
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "30%", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Pending</span>
          <div style={{ width: "100%", height: "100px", background: "var(--line-strong)", borderRadius: "4px", position: "relative", overflow: "hidden" }}>
            <div className="viz-bar" style={{ 
              position: "absolute", bottom: 0, left: 0, width: "100%", 
              height: loaded ? `${pPending}%` : "0%",
              background: "var(--warn)", opacity: 0.8
            }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "30%", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Active</span>
          <div style={{ width: "100%", height: "100px", background: "var(--line-strong)", borderRadius: "4px", position: "relative", overflow: "hidden" }}>
            <div className="viz-bar" style={{ 
              position: "absolute", bottom: 0, left: 0, width: "100%", 
              height: loaded ? `${pActive}%` : "0%",
              background: "var(--active)", opacity: 0.8
            }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "30%", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Done</span>
          <div style={{ width: "100%", height: "100px", background: "var(--line-strong)", borderRadius: "4px", position: "relative", overflow: "hidden" }}>
            <div className="viz-bar" style={{ 
              position: "absolute", bottom: 0, left: 0, width: "100%", 
              height: loaded ? `${pCompleted}%` : "0%",
              background: "var(--success)", opacity: 0.8
            }} />
          </div>
        </div>

      </div>
    </div>
  );
}

export function SystemHealthRing({ busy, total }: { busy: number, total: number }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);
  
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const percent = total > 0 ? (busy / total) : 0;
  const offset = circumference - (percent * circumference);

  return (
    <div className="viz-container" style={{ position: "relative" }}>
      <svg className="viz-chart" viewBox="0 0 100 100" style={{ maxWidth: "160px" }}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--obsidian-accent)" />
            <stop offset="100%" stopColor="#00ffaa" />
          </linearGradient>
        </defs>
        <circle
          className="viz-line-bg"
          cx="50" cy="50" r={radius}
          strokeWidth="4"
          stroke="rgba(255,255,255,0.03)"
          fill="none"
        />
        <circle
          cx="50" cy="50" r={radius}
          stroke="url(#ringGrad)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: loaded ? offset : circumference,
            transition: "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            filter: "drop-shadow(0 0 5px var(--obsidian-glow))"
          }}
        />
        <text x="50" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff" fontFamily="IBM Plex Sans">
          {total > 0 ? Math.round(percent * 100) : 0}%
        </text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="#666" letterSpacing="1">
          CAPACITY
        </text>
      </svg>
    </div>
  );
}
