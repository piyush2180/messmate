import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import DiwaliSparkles from './DiwaliSparkles'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <DiwaliSparkles />
    </ErrorBoundary>
  </React.StrictMode>,
)

