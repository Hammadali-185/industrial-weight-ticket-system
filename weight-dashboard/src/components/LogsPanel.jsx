import React from 'react'
export default function LogsPanel({ logs }) {
	return (
		<div className="rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-900/80 to-zinc-800/60 p-6 shadow-xl relative overflow-hidden">
			{/* Background glow */}
			<div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl"></div>
			<div className="flex items-center gap-3 mb-4 relative z-10">
				<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
					<span className="text-sm">📊</span>
				</div>
				<h3 className="text-lg font-semibold text-zinc-200">System Logs</h3>
			</div>
			<div className="h-64 overflow-auto font-mono text-sm bg-zinc-950/60 rounded-xl p-4 border border-zinc-600/30 relative z-10">
				{logs.length === 0 ? (
					<div className="text-zinc-500 text-center py-8">
						<div className="text-2xl mb-2">📝</div>
						<div>No logs yet...</div>
					</div>
				) : (
					logs.slice(0, 25).map((l, i) => (
						<div key={i} className="whitespace-pre py-1 hover:bg-zinc-800/30 rounded px-2 transition-colors">
							{l}
						</div>
					))
				)}
			</div>
		</div>
	)
}


