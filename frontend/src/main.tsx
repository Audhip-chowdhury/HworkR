import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { AuthProvider } from './auth/AuthContext'
import App from './App'
import './index.css'
import 'react-toastify/dist/ReactToastify.css'

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <AuthProvider>
        <div className="viewportStack">
          <div className="viewportStackMain">
            <App />
            <ToastContainer position="top-right" autoClose={3500} pauseOnHover newestOnTop closeOnClick theme="light" />
          </div>
        </div>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
