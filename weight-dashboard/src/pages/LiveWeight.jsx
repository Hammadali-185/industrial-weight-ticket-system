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
    serialLineCoding,
    logs,
    readings,
    stableWeight,
    reconnect,
    serialPreview
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

              {/* Baud Rate — value comes from auto-probe (browser) or main process (desktop) */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <span className="text-white text-lg">⚡</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Serial speed</h3>
                </div>
                <p className="text-2xl font-bold text-gray-700 tabular-nums">
                  {baud != null ? `${baud} baud` : status === 'connecting' ? '…' : '—'}
                </p>
                {serialLineCoding && (
                  <p className="text-sm font-medium text-gray-600 mt-1">
                    Frame: <span className="font-mono">{serialLineCoding}</span> (data · parity · stop bits)
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                  Configured for the scale: <strong>9600 baud</strong>, 8 data bits, parity none, 1 stop bit, handshaking / flow control none (8N1). Browser and desktop use the same line; desktop settings live in <code className="bg-gray-100 px-1 rounded text-[11px]">main/serialManager.cjs</code>.
                </p>
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

              {/* What the app is actually receiving (helps verify baud / protocol) */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Incoming data</h3>
                {status === 'on' && serialPreview ? (
                  <>
                    <p className="text-xs text-gray-500 mb-2">
                      Sample of what arrived on the serial link (browser shows raw text; desktop app shows parsed kg). The app turns matching <code className="bg-gray-100 px-1 rounded">=…</code> lines into weight readings.
                    </p>
                    <pre className="text-xs font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                      {serialPreview}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-gray-600">
                    {status === 'connecting'
                      ? 'Connecting… **9600 8N1 is tried first**, then other bauds. If logs show “no bytes” for everything, Chrome likely has the **wrong** COM (choose **USB Serial / FTDI** like in Device Manager, not Intel AMT). Close PuTTY if it uses that COM.'
                      : 'Shows a live sample once status is ON. You do not need to reinstall the app: use Reconnect after changing the scale baud, or refresh the page to retry auto-connect.'}
                  </p>
                )}
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
