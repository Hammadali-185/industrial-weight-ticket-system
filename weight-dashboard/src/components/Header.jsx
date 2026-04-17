import React from 'react'
export default function Header({ status, onReconnect, theme, setTheme }) {
	const badge = status === 'on'
		? <span className="px-4 py-2 rounded-full bg-gradient-to-r from-green-600/20 to-emerald-600/20 text-green-400 border border-green-500/30 font-medium shadow-lg">🟢 Connected</span>
		: status === 'connecting'
			? <span className="px-4 py-2 rounded-full bg-gradient-to-r from-yellow-600/20 to-orange-600/20 text-yellow-400 border border-yellow-500/30 font-medium shadow-lg animate-pulse">🟡 Connecting...</span>
			: <span className="px-4 py-2 rounded-full bg-gradient-to-r from-red-600/20 to-pink-600/20 text-red-400 border border-red-500/30 font-medium shadow-lg">🔴 Disconnected</span>

	return (
		<div className="flex items-center justify-between mb-8">
			<div className="flex items-center gap-4">
				<div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
					<span className="text-2xl">⚖️</span>
				</div>
				<div>
					<h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
						Saqib Silk Industry
					</h1>
					<p className="text-sm text-zinc-400 font-medium">Precision Weight Monitoring System</p>
				</div>
			</div>
			<div className="flex items-center gap-3">
				{badge}
				<button
					type="button"
					onClick={() => {
						void onReconnect()
					}}
					className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all duration-200 text-white font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
					🔄 Reconnect Weight Machine
				</button>
				<button
					onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
					className="px-4 py-2 rounded-lg bg-gradient-to-r from-zinc-700 to-zinc-600 hover:from-zinc-600 hover:to-zinc-500 transition-all duration-200 text-zinc-100 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
					{theme === 'dark' ? '☀️ Light' : '🌙 Dark'} Mode
				</button>
			</div>
		</div>
	)
}


