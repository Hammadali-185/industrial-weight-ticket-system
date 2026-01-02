import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const Navbar = () => {
  const location = useLocation()

  return (
    <nav className="bg-white shadow-lg border-b-2 border-yellow-400 relative z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Title */}
          <div className="flex items-center">
            <Link 
              to="/" 
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl">🧵</span>
              <span className="text-xl font-bold text-gray-800">
                Saqib Silk Industry
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex space-x-8">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-600 hover:text-black hover:bg-yellow-100'
              }`}
            >
              Live Weight
            </Link>
            <Link
              to="/ticket-generator"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/ticket-generator'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-600 hover:text-black hover:bg-yellow-100'
              }`}
            >
              Ticket Generator
            </Link>
            <Link
              to="/generate-list"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/generate-list'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-600 hover:text-black hover:bg-yellow-100'
              }`}
            >
              Generate List
            </Link>
            <Link
              to="/history"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/history'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-600 hover:text-black hover:bg-yellow-100'
              }`}
            >
              History
            </Link>
            <Link
              to="/payment"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/payment'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-600 hover:text-black hover:bg-yellow-100'
              }`}
            >
              Payment
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar