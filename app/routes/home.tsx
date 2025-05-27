import { Welcome } from "../welcome/welcome";
import { Link } from "react-router";

export function meta() {
  return [
    { title: "Bluetooth Connection Hub - Web Bluetooth Solutions" },
    { name: "description", content: "Explore different approaches for establishing Bluetooth connections in web applications. Compare Web Bluetooth API, WebRTC, WebSocket, and hybrid solutions." },
  ];
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #000000 0%, #333333 100%)",
  padding: "2rem",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
};

const headerStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "3rem",
  color: "white"
};

const titleStyle: React.CSSProperties = {
  fontSize: "3rem",
  fontWeight: "700",
  margin: "0 0 1rem 0",
  textShadow: "0 2px 4px rgba(0,0,0,0.3)"
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: "400",
  opacity: 0.9,
  maxWidth: "600px",
  margin: "0 auto"
};

const navigationSectionStyle: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "3rem",
  backgroundColor: "rgba(255, 255, 255, 0.95)",
  borderRadius: "20px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
  backdropFilter: "blur(10px)"
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "2rem",
  fontWeight: "600",
  marginBottom: "1rem",
  color: "#000000",
  textAlign: "center"
};

const sectionDescriptionStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  color: "#333333",
  textAlign: "center",
  marginBottom: "3rem",
  lineHeight: "1.6"
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "2rem",
  marginTop: "2rem"
};

const linkBaseStyle: React.CSSProperties = {
  padding: "2rem",
  textDecoration: "none",
  borderRadius: "16px",
  textAlign: "center",
  fontWeight: "600",
  fontSize: "1.1rem",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  border: "2px solid transparent",
  position: "relative",
  overflow: "hidden",
  transform: "translateY(0)",
  boxShadow: "0 8px 25px rgba(0,0,0,0.1)"
};

const approaches = [
  { 
    to: "/approach-one", 
    title: "SCAN-TEST", 
    
    gradient: "linear-gradient(135deg, #000000 0%, #333333 100%)",
    hoverGradient: "linear-gradient(135deg, #333333 0%, #000000 100%)"
  },
  { 
    to: "/approach-two", 
    title: "DAQ TEST", 
    
    gradient: "linear-gradient(135deg, #000000 0%, #333333 100%)",
    hoverGradient: "linear-gradient(135deg, #333333 0%, #000000 100%)"
  },
  { 
    to: "/approach-three", 
    title: "Multi-connect-test", 
   
    gradient: "linear-gradient(135deg, #000000 0%, #444444 100%)",
    hoverGradient: "linear-gradient(135deg, #444444 0%, #000000 100%)"
  },
  { 
    to: "/approach-four", 
    title: "Portal Page", 
    
    gradient: "linear-gradient(135deg, #ffffff 0%, #eeeeee 100%)",
    hoverGradient: "linear-gradient(135deg, #eeeeee 0%, #dddddd 100%)"
  },
  { 
    to: "/approach-five", 
    title: "Find all devices info", 
   
    gradient: "linear-gradient(135deg, #000000 0%, #555555 100%)",
    hoverGradient: "linear-gradient(135deg, #555555 0%, #000000 100%)"
  }
];

export default function Home() {
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Bluetooth Connection Hub</h1>
        <p style={subtitleStyle}>
          Explore various approaches to establish Bluetooth connections in web applications
        </p>
      </div>
      
      <div style={navigationSectionStyle}>
        <h2 style={sectionTitleStyle}>Choose Your Approach</h2>
        <p style={sectionDescriptionStyle}>
          Each approach offers unique advantages for different use cases. Select one to learn more about its implementation.
        </p>
        
        <div style={gridStyle}>
          {approaches.map((approach, index) => (
            <Link 
              key={approach.to}
              to={approach.to} 
              style={{
                ...linkBaseStyle,
                background: approach.gradient,
                color: approach.gradient.includes("ffffff") ? "#000000" : "white",
                animationDelay: `${index * 0.1}s`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-8px)";
                e.currentTarget.style.background = approach.hoverGradient;
                e.currentTarget.style.boxShadow = "0 20px 40px rgba(0,0,0,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.background = approach.gradient;
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.1)";
              }}
            >
              <div style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.5rem" }}>
                {approach.title}
              </div>
          
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
