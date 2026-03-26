import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.scss'
import './types/electron.d.ts'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
