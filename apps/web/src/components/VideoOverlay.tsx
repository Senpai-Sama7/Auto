import { useState, useEffect } from "react";

export function VideoOverlay({ onEnter }: { onEnter: () => void }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check if the user already saw the overlay in this session
    const hasSeenOverlay = sessionStorage.getItem("hasSeenOverlay");
    if (hasSeenOverlay) {
      setIsVisible(false);
      onEnter();
    }
    
    // Safety timeout: auto-dismiss after 1s
    const timer = setTimeout(() => {
      if (isVisible) {
        setIsFading(true);
        setTimeout(() => {
          setIsVisible(false);
          onEnter();
        }, 1000);
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [onEnter, isVisible]);

  const handleEnter = () => {
    setIsFading(true);
    sessionStorage.setItem("hasSeenOverlay", "true");
    setTimeout(() => {
      setIsVisible(false);
      onEnter();
    }, 1000); // 1s fade transition
  };

  if (!isVisible) return null;

  return (
    <div 
      id="video-overlay-root"
      style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 999999,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
      opacity: isFading ? 0 : 1,
      pointerEvents: isVisible && !isFading ? "auto" : "none",
      transition: "opacity 1s ease-in-out",
      visibility: isVisible ? "visible" : "hidden"
    }}>
      <video 
        autoPlay 
        loop 
        muted 
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.6
        }}
      >
        <source src="https://cdn.pixabay.com/video/2021/08/04/83864-584742416_large.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      <div style={{
        position: "relative",
        zIndex: 1,
        textAlign: "center",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2rem"
      }}>
        <h1 style={{
          fontSize: "4rem",
          fontWeight: "300",
          letterSpacing: "2px",
          margin: 0,
          textTransform: "uppercase",
          textShadow: "0 4px 20px rgba(0,0,0,0.5)"
        }}>
          Ultimate System
        </h1>
        <p style={{
          fontSize: "1.2rem",
          fontWeight: "300",
          letterSpacing: "1px",
          opacity: 0.8,
          margin: 0
        }}>
          Autonomous Orchestration Stack
        </p>
        
        <button 
          onClick={handleEnter}
          style={{
            marginTop: "2rem",
            padding: "1rem 3rem",
            fontSize: "1.1rem",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            color: "white",
            cursor: "pointer",
            borderRadius: "4px",
            textTransform: "uppercase",
            letterSpacing: "2px",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          Enter Workspace
        </button>
      </div>
    </div>
  );
}
