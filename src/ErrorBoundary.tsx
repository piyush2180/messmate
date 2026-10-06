import React, { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo)
  }

  public handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#fefae0",
          color: "#283618",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center"
        }}>
          <div style={{
            maxWidth: "400px",
            background: "#ffffff",
            padding: "32px",
            borderRadius: "16px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            border: "1px solid rgba(40,54,24,0.1)"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌿</div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>
              MessMate encountered an issue
            </h2>
            <p style={{ fontSize: "14px", color: "#606c38", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              A temporary display error occurred. Please refresh to continue ordering your meal.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "#283618",
                color: "#fefae0",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Refresh Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
