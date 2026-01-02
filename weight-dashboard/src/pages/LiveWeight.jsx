import React from 'react'
import { useWeight } from '../context/WeightContext'
import Header from '../components/Header'
import WeightDisplay from '../components/WeightDisplay'
import LogsPanel from '../components/LogsPanel'

const LiveWeight = () => {
  // Get all data from global weight context (connection runs globally)
  const {
    status,
    port,
    baud,
    logs,
    readings,
    stableWeight,
    reconnect
  } = useWeight()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23f0f9ff%22%20fill-opacity%3D%220.1%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 z-0"></div>
      
      <div className="relative z-10">
        <Header 
          status={status} 
          onReconnect={reconnect}
        />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Weight Display */}
            <div className="lg:col-span-2">
              <WeightDisplay 
                stable={stableWeight}
                readings={readings}
                status={status}
              />
            </div>
            
            {/* Connection Info */}
            <div className="space-y-6">
              {/* Port Information */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <span className="text-white text-lg">🔌</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Port</h3>
                </div>
                <p className="text-2xl font-bold text-gray-700">{port || '—'}</p>
              </div>

              {/* Baud Rate */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <span className="text-white text-lg">⚡</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Baud Rate</h3>
                </div>
                <p className="text-2xl font-bold text-gray-700">{baud || '—'}</p>
              </div>

              {/* Status */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                    <span className="text-white text-lg">📡</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Status</h3>
                </div>
                <div className="flex items-center space-x-2">
                  {status === 'on' && <span className="text-2xl">🟢</span>}
                  {status === 'off' && <span className="text-2xl">🔴</span>}
                  {status === 'connecting' && <span className="text-2xl">🟡</span>}
                  <span className="text-lg font-bold text-gray-700 uppercase">
                    {status === 'on' ? 'ON' : status === 'off' ? 'OFF' : 'CONNECTING'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Logs Panel */}
          <div className="mt-8">
            <LogsPanel logs={logs} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default LiveWeight
