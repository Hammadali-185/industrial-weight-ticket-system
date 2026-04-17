import React from 'react'

export default function WeightDisplay({ stable, readings = [] }) {
	const live =
		Array.isArray(readings) && readings.length > 0 ? readings[readings.length - 1] : null

	return (
		<div className="w-full rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/70 p-12 text-center shadow-2xl backdrop-blur-sm relative overflow-hidden">
			<div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-2xl"></div>
			<div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-500/3 to-pink-500/3 rounded-2xl"></div>
			{stable != null ? (
				<div className="space-y-4 relative z-10">
					<div className="flex items-center justify-center gap-4 mb-6">
						<div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-lg">
							<span className="text-3xl">⚖️</span>
						</div>
						<div className="text-left">
							<div className="text-sm text-zinc-400 font-medium">Current Weight</div>
							<div className="text-xs text-zinc-500">Stable Reading</div>
						</div>
					</div>
					<div className="text-7xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
						{stable.toFixed(3)}
					</div>
					<div className="text-4xl font-bold text-zinc-300 flex items-center justify-center gap-2">
						<span>kg</span>
						<span className="text-2xl">📏</span>
					</div>
					<div className="mt-6 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
						<div className="text-sm text-emerald-400 font-medium">✓ Stable Measurement</div>
					</div>
				</div>
			) : live != null && !Number.isNaN(live) && Number.isFinite(live) ? (
				<div className="space-y-4 relative z-10">
					<div className="flex items-center justify-center gap-4 mb-6">
						<div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg animate-pulse">
							<span className="text-3xl">📟</span>
						</div>
						<div className="text-left">
							<div className="text-sm text-zinc-400 font-medium">Live Weight</div>
							<div className="text-xs text-zinc-500">Settling — need 5 matching readings</div>
						</div>
					</div>
					<div className="text-7xl font-black tracking-tight bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent">
						{live.toFixed(3)}
					</div>
					<div className="text-4xl font-bold text-zinc-300 flex items-center justify-center gap-2">
						<span>kg</span>
						<span className="text-2xl">📏</span>
					</div>
					<div className="mt-6 px-6 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
						<div className="text-sm text-amber-400 font-medium">Hold steady for a stable lock</div>
					</div>
				</div>
			) : (
				<div className="space-y-6 relative z-10">
					<div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg mx-auto animate-pulse">
						<span className="text-3xl">⏳</span>
					</div>
					<div className="text-2xl text-zinc-400 font-medium">Waiting for stable value...</div>
					<div className="text-sm text-zinc-500">Collecting readings for precision measurement</div>
				</div>
			)}
		</div>
	)
}
