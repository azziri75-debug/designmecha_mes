import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ApprovalBadgeProvider } from './contexts/ApprovalBadgeContext'
import { WorkOrderBadgeProvider } from './contexts/WorkOrderBadgeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ApprovalBadgeProvider>
            <WorkOrderBadgeProvider>
              <App />
            </WorkOrderBadgeProvider>
          </ApprovalBadgeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
