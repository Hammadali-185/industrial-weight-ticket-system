import React from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { WeightProvider } from './context/WeightContext'
import Navbar from './components/Navbar'
import LiveWeight from './pages/LiveWeight'
import TicketGenerator from './pages/TicketGenerator'
import GenerateList from './pages/GenerateList'
import History from './pages/History'
import Payment from './pages/Payment'

function App() {
  console.log('App component rendered')
  
  return (
    <WeightProvider>
      <Router>
        <div className="min-h-screen bg-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<LiveWeight />} />
            <Route path="/ticket-generator" element={<TicketGenerator />} />
            <Route path="/generate-list" element={<GenerateList />} />
            <Route path="/history" element={<History />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="*" element={<div>Page not found</div>} />
          </Routes>
        </div>
      </Router>
    </WeightProvider>
  )
}

export default App