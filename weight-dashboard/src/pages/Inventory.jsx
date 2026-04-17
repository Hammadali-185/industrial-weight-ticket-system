import React, { useEffect, useMemo, useState } from 'react'
import { loadHistory, loadInventory, saveInventory } from '../utils/storage'

const todayISO = () => {
  // Local date (not UTC) in YYYY-MM-DD
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const toNumber = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toInt = (v) => {
  const n = toNumber(v)
  if (n === null) return null
  const i = Math.floor(n)
  return Number.isFinite(i) ? i : null
}

function normalizeName(s) {
  return String(s || '').trim()
}

function normalizeKey(s) {
  return normalizeName(s).toLowerCase()
}

function formatMaybeNumber(v, digits = 3) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '--'
  return n.toFixed(digits)
}

function uniqBoxesFromList(list) {
  const scanned = Array.isArray(list?.scannedList) ? list.scannedList : []
  const seen = new Set()
  const unique = []
  for (const box of scanned) {
    const boxKey = `${box?.boxNumber}-${box?.netWeight}-${box?.grossWeight}-${box?.cones}`
    if (seen.has(boxKey)) continue
    seen.add(boxKey)
    unique.push(box)
  }
  return unique
}

function computeBalances(txns) {
  const map = new Map()
  for (const t of txns) {
    const effectiveCompany = normalizeName(t.linkedCompanyName || t.companyName)
    const lot = normalizeName(t.lot)
    if (!effectiveCompany || !lot) continue
    const key = `${effectiveCompany}__${lot}`
    const prev = map.get(key) || { companyName: effectiveCompany, lot, boxes: 0, weightKg: 0 }

    const sign = t.type === 'out' ? -1 : 1
    const boxes = Number(t.boxes) || 0
    const weightKg = Number(t.totalWeightKg) || 0

    prev.boxes += sign * boxes
    prev.weightKg += sign * weightKg
    map.set(key, prev)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.companyName !== b.companyName) return a.companyName.localeCompare(b.companyName)
    return a.lot.localeCompare(b.lot)
  })
}

function computeBalanceMap(txns) {
  const map = new Map()
  for (const t of txns) {
    const effectiveCompany = normalizeKey(t.linkedCompanyName || t.companyName)
    const lot = normalizeKey(t.lot)
    if (!effectiveCompany || !lot) continue
    const key = `${effectiveCompany}__${lot}`
    const prev = map.get(key) || { boxes: 0, weightKg: 0 }

    const sign = t.type === 'out' ? -1 : 1
    const boxes = Number(t.boxes) || 0
    const weightKg = Number(t.totalWeightKg) || 0

    prev.boxes += sign * boxes
    prev.weightKg += sign * weightKg
    map.set(key, prev)
  }
  return map
}

function Inventory() {
  const [activeTab, setActiveTab] = useState('in')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [txns, setTxns] = useState([])
  const [history, setHistory] = useState([])

  // IN form
  const [inDate] = useState(todayISO())
  const [inLot, setInLot] = useState('')
  const [inCompanyName, setInCompanyName] = useState('')
  const [inBoxes, setInBoxes] = useState('')
  const [inKgPerBox, setInKgPerBox] = useState('')

  // OUT form (auto)
  const [outDate] = useState(todayISO())
  const [outMode, setOutMode] = useState('auto') // 'auto' | 'manual'
  const [outSelectedListId, setOutSelectedListId] = useState('')
  const [outLot, setOutLot] = useState('')
  const [outKgPerBox, setOutKgPerBox] = useState('')

  // OUT form (manual)
  const [outManualLot, setOutManualLot] = useState('')
  const [outManualCompanyName, setOutManualCompanyName] = useState('')
  const [outManualBoxes, setOutManualBoxes] = useState('')
  const [outManualKgPerBox, setOutManualKgPerBox] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const [inv, hist] = await Promise.all([loadInventory(), loadHistory()])
        if (!mounted) return
        setTxns(Array.isArray(inv) ? inv : [])
        setHistory(Array.isArray(hist) ? hist : [])
      } catch (e) {
        if (!mounted) return
        setError(e?.message || String(e))
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const balances = useMemo(() => computeBalances(txns), [txns])

  const companyNamesFromIn = useMemo(() => {
    const set = new Set()
    for (const t of txns) {
      if (t?.type === 'in') {
        const name = normalizeName(t.companyName)
        if (name) set.add(name)
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b))
  }, [txns])

  const companyKeyToDisplayName = useMemo(() => {
    const map = new Map()
    for (const name of companyNamesFromIn) {
      map.set(normalizeKey(name), name)
    }
    return map
  }, [companyNamesFromIn])

  const historyOptions = useMemo(() => {
    const opts = []
    for (const item of history) {
      if (!item || !item.name) continue
      opts.push({
        id: String(item.id),
        name: String(item.name),
        timestamp: Number(item.timestamp) || 0,
        item,
      })
    }
    opts.sort((a, b) => b.timestamp - a.timestamp)
    return opts
  }, [history])

  const selectedHistoryItem = useMemo(() => {
    if (!outSelectedListId) return null
    return historyOptions.find((o) => o.id === String(outSelectedListId))?.item || null
  }, [historyOptions, outSelectedListId])

  const selectedHistoryUniqueBoxes = useMemo(() => {
    if (!selectedHistoryItem) return []
    return uniqBoxesFromList(selectedHistoryItem)
  }, [selectedHistoryItem])

  const selectedHistoryTotalNW = useMemo(() => {
    const v = selectedHistoryItem?.totals?.totalNW
    const n = toNumber(v)
    return n === null ? 0 : n
  }, [selectedHistoryItem])

  const autoOutMatchedCompany = useMemo(() => {
    const listName = normalizeName(selectedHistoryItem?.name)
    if (!listName) return null
    const key = normalizeKey(listName)
    return companyKeyToDisplayName.get(key) || null
  }, [companyKeyToDisplayName, selectedHistoryItem])

  const inTotalWeight = useMemo(() => {
    const boxes = toInt(inBoxes)
    const kg = toNumber(inKgPerBox)
    if (boxes === null || kg === null) return null
    return boxes * kg
  }, [inBoxes, inKgPerBox])

  const manualOutTotalWeight = useMemo(() => {
    const boxes = toInt(outManualBoxes)
    const kg = toNumber(outManualKgPerBox)
    if (boxes === null || kg === null) return null
    return boxes * kg
  }, [outManualBoxes, outManualKgPerBox])

  const autoOutBoxes = useMemo(() => selectedHistoryUniqueBoxes.length, [selectedHistoryUniqueBoxes])

  const persist = async (next) => {
    setSaving(true)
    setError('')
    try {
      const ok = await saveInventory(next)
      if (!ok) throw new Error('Could not save inventory')
      setTxns(next)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const addIn = async () => {
    const lot = normalizeName(inLot)
    const companyName = normalizeName(inCompanyName)
    const boxes = toInt(inBoxes)
    const kgPerBox = toNumber(inKgPerBox)
    if (!lot || !companyName) {
      setError('Lot and Company Name are required.')
      return
    }
    if (boxes === null || boxes < 0) {
      setError('Boxes must be a valid number.')
      return
    }
    if (kgPerBox === null || kgPerBox < 0) {
      setError('KG per box must be a valid number.')
      return
    }

    const totalWeightKg = boxes * kgPerBox
    const txn = {
      id: Date.now(),
      type: 'in',
      dateISO: inDate,
      lot,
      boxes,
      kgPerBox,
      totalWeightKg,
      companyName,
      createdAt: Date.now(),
    }
    await persist([txn, ...txns])
    setInLot('')
    setInCompanyName('')
    setInBoxes('')
    setInKgPerBox('')
  }

  const addOutFromGenerateList = async () => {
    if (!selectedHistoryItem) {
      setError('Select a generated list first.')
      return
    }
    const matchedCompanyName = autoOutMatchedCompany
    if (!matchedCompanyName) {
      setError('No matching Inventory company found for this list Name. Create an Inventory IN first.')
      return
    }
    const lot = normalizeName(outLot)
    const kgPerBox = toNumber(outKgPerBox) // optional for OUT; display '--' if missing/invalid
    if (!lot) {
      setError('Lot is required.')
      return
    }

    const boxes = autoOutBoxes
    const totalWeightKg = selectedHistoryTotalNW

    // Warn if this will make balance negative, but allow user to proceed.
    const balMap = computeBalanceMap(txns)
    const key = `${normalizeKey(matchedCompanyName)}__${normalizeKey(lot)}`
    const current = balMap.get(key) || { boxes: 0, weightKg: 0 }
    const nextBoxes = current.boxes - boxes
    const nextWeight = current.weightKg - (Number.isFinite(Number(totalWeightKg)) ? Number(totalWeightKg) : 0)
    if (nextBoxes < 0 || nextWeight < 0) {
      setError('⚠️ This OUT will make the balance negative. Click Proceed to continue.')
      const ok = window.confirm(
        `This OUT will make balance negative for ${matchedCompanyName} (lot ${lot}).\n\nProceed anyway?`
      )
      if (!ok) return
    }

    const txn = {
      id: Date.now(),
      type: 'out',
      dateISO: outDate,
      lot,
      boxes,
      kgPerBox: kgPerBox === null || kgPerBox < 0 ? null : kgPerBox,
      totalWeightKg,
      companyName: '--',
      linkedCompanyName: matchedCompanyName,
      source: 'generate-list',
      sourceListId: selectedHistoryItem.id,
      createdAt: Date.now(),
    }
    await persist([txn, ...txns])
    setOutSelectedListId('')
    setOutLot('')
    setOutKgPerBox('')
  }

  const addOutManual = async () => {
    const lot = normalizeName(outManualLot)
    const companyName = normalizeName(outManualCompanyName)
    const boxes = toInt(outManualBoxes)
    const kgPerBox = toNumber(outManualKgPerBox) // optional for OUT; display '--' if missing/invalid
    if (!lot || !companyName) {
      setError('Lot and Company Name are required.')
      return
    }
    if (boxes === null || boxes < 0) {
      setError('Boxes must be a valid number.')
      return
    }

    const totalWeightKg = kgPerBox === null || kgPerBox < 0 ? null : boxes * kgPerBox

    // Warn if this will make balance negative, but allow user to proceed.
    const balMap = computeBalanceMap(txns)
    const key = `${normalizeKey(companyName)}__${normalizeKey(lot)}`
    const current = balMap.get(key) || { boxes: 0, weightKg: 0 }
    const nextBoxes = current.boxes - boxes
    const deltaWeight = Number.isFinite(Number(totalWeightKg)) ? Number(totalWeightKg) : 0
    const nextWeight = current.weightKg - deltaWeight
    if (nextBoxes < 0 || nextWeight < 0) {
      setError('⚠️ This OUT will make the balance negative. Click Proceed to continue.')
      const ok = window.confirm(
        `This OUT will make balance negative for ${companyName} (lot ${lot}).\n\nProceed anyway?`
      )
      if (!ok) return
    }

    const txn = {
      id: Date.now(),
      type: 'out',
      dateISO: outDate,
      lot,
      boxes,
      kgPerBox: kgPerBox === null || kgPerBox < 0 ? null : kgPerBox,
      totalWeightKg,
      companyName,
      createdAt: Date.now(),
    }
    await persist([txn, ...txns])
    setOutManualLot('')
    setOutManualCompanyName('')
    setOutManualBoxes('')
    setOutManualKgPerBox('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Inventory</h1>
              <p className="text-sm text-gray-500 mt-1">Track IN/OUT transactions and remaining balances.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('in')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  activeTab === 'in' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                In
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('out')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  activeTab === 'out' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Out
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-8 text-gray-500">Loading…</div>
          ) : (
            <>
              {/* Forms */}
              {activeTab === 'in' && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Inventory In</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                        <input className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50" value={inDate} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lot</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={inLot}
                          onChange={(e) => setInLot(e.target.value)}
                          placeholder="e.g. L1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={inCompanyName}
                          onChange={(e) => setInCompanyName(e.target.value)}
                          placeholder="e.g. ABC"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Boxes</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={inBoxes}
                          onChange={(e) => setInBoxes(e.target.value)}
                          inputMode="numeric"
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">KG (per box)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={inKgPerBox}
                          onChange={(e) => setInKgPerBox(e.target.value)}
                          inputMode="decimal"
                          placeholder="e.g. 2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Weight (total)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50"
                          value={inTotalWeight === null ? '' : inTotalWeight.toFixed(3)}
                          disabled
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void addIn()}
                      className="mt-5 w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Add IN'}
                    </button>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Balances (remaining)</h2>
                    {balances.length === 0 ? (
                      <div className="text-sm text-gray-500">No balances yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-200">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Company</th>
                              <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Lot</th>
                              <th className="border border-gray-200 px-3 py-2 text-right text-sm font-bold text-gray-700">Boxes</th>
                              <th className="border border-gray-200 px-3 py-2 text-right text-sm font-bold text-gray-700">Weight (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balances.map((b) => (
                              <tr key={`${b.companyName}-${b.lot}`} className="hover:bg-yellow-50">
                                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800">{b.companyName}</td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800">{b.lot}</td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800 text-right">{b.boxes}</td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800 text-right">{b.weightKg.toFixed(3)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'out' && (
                <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h2 className="text-xl font-bold text-gray-800">Inventory Out</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOutMode('auto')}
                        className={`px-3 py-2 rounded-lg font-semibold transition-colors ${
                          outMode === 'auto' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Linked (Generate List)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutMode('manual')}
                        className={`px-3 py-2 rounded-lg font-semibold transition-colors ${
                          outMode === 'manual' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  {outMode === 'auto' ? (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                        <input className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50" value={outDate} disabled />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Generated List (Name must match an Inventory IN company)</label>
                        <select
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-white"
                          value={outSelectedListId}
                          onChange={(e) => setOutSelectedListId(e.target.value)}
                        >
                          <option value="">Select…</option>
                          {historyOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                        {selectedHistoryItem && (
                          <div className="mt-2 text-xs text-gray-500">
                            Boxes: <span className="font-semibold">{autoOutBoxes}</span> | Total NW: <span className="font-semibold">{selectedHistoryTotalNW.toFixed(3)} kg</span> | Match:{' '}
                            <span className={`font-semibold ${autoOutMatchedCompany ? 'text-green-700' : 'text-red-700'}`}>
                              {autoOutMatchedCompany ? `Yes (${autoOutMatchedCompany})` : 'No'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lot</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outLot}
                          onChange={(e) => setOutLot(e.target.value)}
                          placeholder="e.g. L1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
                        <input className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50" value="--" disabled />
                        <div className="mt-1 text-xs text-gray-500">Saved as `--` (balance subtracts from the matched company).</div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">KG (input field)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outKgPerBox}
                          onChange={(e) => setOutKgPerBox(e.target.value)}
                          inputMode="decimal"
                          placeholder="e.g. 2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Boxes</label>
                        <input className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50" value={String(autoOutBoxes)} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Weight (total)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50"
                          value={selectedHistoryItem ? selectedHistoryTotalNW.toFixed(3) : ''}
                          disabled
                        />
                        <div className="mt-1 text-xs text-gray-500">Auto from Generate List Total NW.</div>
                      </div>
                      <div className="lg:col-span-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void addOutFromGenerateList()}
                          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60"
                        >
                          {saving ? 'Saving…' : 'Add OUT (linked)'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                        <input className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50" value={outDate} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lot</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outManualLot}
                          onChange={(e) => setOutManualLot(e.target.value)}
                          placeholder="e.g. L1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outManualCompanyName}
                          onChange={(e) => setOutManualCompanyName(e.target.value)}
                          placeholder="e.g. ABC"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Boxes</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outManualBoxes}
                          onChange={(e) => setOutManualBoxes(e.target.value)}
                          inputMode="numeric"
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">KG (per box)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg"
                          value={outManualKgPerBox}
                          onChange={(e) => setOutManualKgPerBox(e.target.value)}
                          inputMode="decimal"
                          placeholder="e.g. 2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Weight (total)</label>
                        <input
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg bg-gray-50"
                          value={manualOutTotalWeight === null ? '' : manualOutTotalWeight.toFixed(3)}
                          disabled
                        />
                      </div>
                      <div className="lg:col-span-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void addOutManual()}
                          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60"
                        >
                          {saving ? 'Saving…' : 'Add OUT (manual)'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transactions table */}
              <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Transactions</h2>
                {txns.length === 0 ? (
                  <div className="text-sm text-gray-500">No transactions yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Type</th>
                          <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Date</th>
                          <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Lot</th>
                          <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Company</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-sm font-bold text-gray-700">Boxes</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-sm font-bold text-gray-700">KG/Box</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-sm font-bold text-gray-700">Weight (kg)</th>
                          <th className="border border-gray-200 px-3 py-2 text-left text-sm font-bold text-gray-700">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txns.map((t) => (
                          <tr key={t.id} className="hover:bg-yellow-50">
                            <td className="border border-gray-200 px-3 py-2 text-sm">
                              <span
                                className={`px-2 py-1 rounded font-bold ${
                                  t.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {t.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800">{t.dateISO || ''}</td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800">{t.lot || ''}</td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800">
                              <div className="flex flex-col">
                                <span>{t.companyName || ''}</span>
                                {t.companyName === '--' && t.linkedCompanyName && (
                                  <span className="text-xs text-gray-500">Linked: {t.linkedCompanyName}</span>
                                )}
                              </div>
                            </td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800 text-right">{t.boxes}</td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800 text-right">
                              {formatMaybeNumber(t.kgPerBox, 3)}
                            </td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-800 text-right">
                              {formatMaybeNumber(t.totalWeightKg, 3)}
                            </td>
                            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-600">
                              {t.source === 'generate-list' ? 'Generate List' : 'Manual'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Inventory

