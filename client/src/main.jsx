import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Home from '/src/pages/home/home.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Home />
  </StrictMode>,
)
