import React, { useState, useEffect, useRef } from 'react'
import { useWeight } from '../context/WeightContext'
import { QRCodeSVG } from 'qrcode.react'
import QRCode from 'qrcode'

const TicketGenerator = () => {
  console.log('TicketGenerator component rendered')
  const { stableWeight } = useWeight()
  
  // Form state with localStorage persistence
  const [formData, setFormData] = useState({
    boxNumber: parseInt(localStorage.getItem('ticket_boxNumber') || '1', 10),
    twist: localStorage.getItem('ticket_twist') || '',
    cones: localStorage.getItem('ticket_cones') || '',
    netWeightType: localStorage.getItem('ticket_netWeightType') || 'percentage',
    netWeightValue: localStorage.getItem('ticket_netWeightValue') || '',
    lotNo: localStorage.getItem('ticket_lotNo') || '061010'
  })

  const [showPreview, setShowPreview] = useState(false)
  const [isTwistEditable, setIsTwistEditable] = useState(false)
  const twistInputRef = useRef(null)

  // Force focus and wake up Chrome's input handling when becoming editable
  useEffect(() => {
    if (isTwistEditable && twistInputRef.current) {
      requestAnimationFrame(() => {
        const el = twistInputRef.current
        if (el && isTwistEditable) {
          el.focus({ preventScroll: true })
          el.setSelectionRange(el.value.length, el.value.length)
          // Chrome hack: dispatch a fake keydown to "wake up" input
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }))
        }
      })
    }
  }, [isTwistEditable])

  // Handle Chrome's focus freeze after dialogs, print windows, or tab suspensions
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isTwistEditable && twistInputRef.current) {
        twistInputRef.current.focus()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [isTwistEditable])

  // Save to localStorage whenever form data changes
  useEffect(() => {
    localStorage.setItem('ticket_boxNumber', formData.boxNumber.toString())
    localStorage.setItem('ticket_twist', formData.twist)
    localStorage.setItem('ticket_cones', formData.cones)
    localStorage.setItem('ticket_netWeightType', formData.netWeightType)
    localStorage.setItem('ticket_netWeightValue', formData.netWeightValue)
    localStorage.setItem('ticket_lotNo', formData.lotNo)
  }, [formData])

  // Calculate net weight
  const calculateNetWeight = () => {
    if (!stableWeight || !formData.netWeightValue) return null
    
    const grossWeight = stableWeight
    const netWeightValue = parseFloat(formData.netWeightValue)
    
    if (formData.netWeightType === 'percentage') {
      // For percentage: G.W - (G.W * percentage / 100)
      // Example: 500 - (500 * 2 / 100) = 500 - 10 = 490
      return grossWeight - (grossWeight * netWeightValue / 100)
    } else {
      // For fixed weight: G.W - fixed value
      // Example: 500 - 2 = 498
      return grossWeight - netWeightValue
    }
  }

  // Get current date
  const getCurrentDate = () => {
    const now = new Date()
    return now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-')
  }

  // Generate QR code data
  const generateQRData = () => {
    const netWeight = calculateNetWeight()
    return `Box No: ${formData.boxNumber}
Twist: ${formData.twist}
Date: ${getCurrentDate()}
Grade: AA
Cones: ${formData.cones}
G.W: ${stableWeight?.toFixed(3) || '0.000'}
N.W: ${netWeight?.toFixed(3) || '0.000'}
Lot No: ${formData.lotNo}`
  }

  // Handle form changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Reset Box Number to 1
  const resetBoxNumber = () => {
    setFormData(prev => ({
      ...prev,
      boxNumber: 1
    }))
  }

  // Increment Box Number
  const incrementBoxNumber = () => {
    setFormData(prev => ({
      ...prev,
      boxNumber: (prev.boxNumber || 1) + 1
    }))
  }

  // Print ticket
  const printTicket = async () => {
    const netWeight = calculateNetWeight()
    
    // Use current box number for printing, then increment after
    const currentBoxNumber = formData.boxNumber
    
    // Generate QR code data string dynamically using the same data as preview
    const qrData = `Box No: ${currentBoxNumber}
Twist: ${formData.twist}
Date: ${getCurrentDate()}
Grade: AA
Cones: ${formData.cones}
G.W: ${stableWeight?.toFixed(3) || '0.000'}
N.W: ${netWeight?.toFixed(3) || '0.000'}
Lot No: ${formData.lotNo}`

    try {
      // Generate QR code as Base64 image in React before opening print window
      const qrImageUrl = await QRCode.toDataURL(qrData, {
        width: 100,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      })

      // Open print window
      const printWindow = window.open('', '_blank')
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fabric Roll Ticket - Saqib Silk Industry</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .ticket { 
                width: 300px; 
                border: 2px solid #000; 
                margin: 0 auto;
              }
              .header { 
                background: #fbbf24 !important; 
                padding: 15px; 
                text-align: center; 
                border-bottom: 2px solid #000;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .header h1 { 
                margin: 0; 
                font-size: 18px; 
                font-weight: bold; 
                color: #000;
              }
              .header p { 
                margin: 5px 0 0 0; 
                font-size: 12px; 
                color: #000;
              }
              .body { 
                padding: 15px; 
                background: white;
              }
              .content { 
                display: flex; 
                justify-content: space-between;
              }
              .data { 
                flex: 1;
              }
              .qr-code { 
                width: 80px; 
                height: 80px; 
                margin-left: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .row { 
                display: flex; 
                justify-content: space-between; 
                margin-bottom: 8px;
                font-size: 14px;
              }
              .label { 
                font-weight: bold; 
                color: #000;
              }
              .value { 
                color: #000;
              }
              .footer { 
                text-align: center; 
                font-size: 10px; 
                color: #666; 
                margin-top: 10px;
                border-top: 1px solid #ccc;
                padding-top: 10px;
              }
            </style>
          </head>
          <body>
            <div class="ticket">
              <div class="header">
                <h1>SAQIB SILK INDUSTRY</h1>
                <p>Contact: [Your Phone Number]</p>
              </div>
              <div class="body">
                <div class="content">
                  <div class="data">
                    <div class="row">
                      <span class="label">Box No:</span>
                      <span class="value">${currentBoxNumber}</span>
                    </div>
                    <div class="row">
                      <span class="label">Twist:</span>
                      <span class="value">${formData.twist}</span>
                    </div>
                    <div class="row">
                      <span class="label">Date:</span>
                      <span class="value">${getCurrentDate()}</span>
                    </div>
                    <div class="row">
                      <span class="label">Grade:</span>
                      <span class="value">AA</span>
                    </div>
                    <div class="row">
                      <span class="label">Cones:</span>
                      <span class="value">${formData.cones}</span>
                    </div>
                    <div class="row">
                      <span class="label">G.W:</span>
                      <span class="value">${stableWeight?.toFixed(3) || '0.000'} kg</span>
                    </div>
                    <div class="row">
                      <span class="label">N.W:</span>
                      <span class="value">${netWeight?.toFixed(3) || '0.000'} kg</span>
                    </div>
                    <div class="row">
                      <span class="label">Lot No:</span>
                      <span class="value">${formData.lotNo}</span>
                    </div>
                  </div>
                  <div class="qr-code">
                    <img id="qr-img" src="${qrImageUrl}" alt="QR Code" width="80" height="80" />
                  </div>
                </div>
              </div>
              <div class="footer">
                <!-- Address removed as requested -->
              </div>
            </div>
          </body>
        </html>
      `)
      
      printWindow.document.close()
      
      // Flag to track if increment has happened
      let incremented = false
      
      // Wait for the QR image to fully load before printing
      const img = printWindow.document.getElementById('qr-img')
      img.onload = () => {
        printWindow.print()
        // Increment box number after printing
        if (!incremented) {
          incrementBoxNumber()
          incremented = true
        }
      }
      
      // Fallback: print after a short delay if onload doesn't fire
      setTimeout(() => {
        printWindow.print()
        // Increment box number after printing (only if not already incremented)
        if (!incremented) {
          incrementBoxNumber()
          incremented = true
        }
      }, 500)
      
    } catch (error) {
      console.error('Error generating QR code:', error)
      // Fallback: open print window without QR code
      const printWindow = window.open('', '_blank')
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fabric Roll Ticket - Saqib Silk Industry</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .ticket { width: 300px; border: 2px solid #000; margin: 0 auto; }
              .header { background: #fbbf24 !important; padding: 15px; text-align: center; border-bottom: 2px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .header h1 { margin: 0; font-size: 18px; font-weight: bold; color: #000; }
              .header p { margin: 5px 0 0 0; font-size: 12px; color: #000; }
              .body { padding: 15px; background: white; }
              .content { display: flex; justify-content: space-between; }
              .data { flex: 1; }
              .qr-code { width: 80px; height: 80px; margin-left: 15px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 6px; text-align: center; background: white; }
              .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
              .label { font-weight: bold; color: #000; }
              .value { color: #000; }
              .footer { text-align: center; font-size: 10px; color: #666; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="ticket">
              <div class="header">
                <h1>SAQIB SILK INDUSTRY</h1>
                <p>Contact: [Your Phone Number]</p>
              </div>
              <div class="body">
                <div class="content">
                  <div class="data">
                    <div class="row"><span class="label">Box No:</span><span class="value">${currentBoxNumber}</span></div>
                    <div class="row"><span class="label">Twist:</span><span class="value">${formData.twist}</span></div>
                    <div class="row"><span class="label">Date:</span><span class="value">${getCurrentDate()}</span></div>
                    <div class="row"><span class="label">Grade:</span><span class="value">AA</span></div>
                    <div class="row"><span class="label">Cones:</span><span class="value">${formData.cones}</span></div>
                    <div class="row"><span class="label">G.W:</span><span class="value">${stableWeight?.toFixed(3) || '0.000'} kg</span></div>
                    <div class="row"><span class="label">N.W:</span><span class="value">${netWeight?.toFixed(3) || '0.000'} kg</span></div>
                    <div class="row"><span class="label">Lot No:</span><span class="value">${formData.lotNo}</span></div>
                  </div>
                  <div class="qr-code">QR Code Error</div>
                </div>
              </div>
              <div class="footer"><!-- Address removed as requested --></div>
            </div>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
      // Increment box number after printing (fallback case)
      incrementBoxNumber()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23fef3c7%22%20fill-opacity%3D%220.1%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 z-0 pointer-events-none"></div>
      
      <div className="relative z-10">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              🏷️ Ticket Generator
            </h1>
            <p className="text-lg text-gray-600">
              Generate and print fabric roll tickets for Saqib Silk Industry
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Ticket Information</h2>
              
              <div className="space-y-6">
                {/* Box Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Box Number
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      min="1"
                      value={formData.boxNumber}
                      onChange={(e) => handleInputChange('boxNumber', parseInt(e.target.value) || 1)}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      placeholder="Box Number"
                    />
                    <button
                      onClick={resetBoxNumber}
                      className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors duration-200"
                      title="Reset to 1"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Twist */}
                <div key="twist-field">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Twist
                  </label>
                  <div className="flex space-x-2">
                    {isTwistEditable ? (
                      // Uncontrolled input for editing - no React reconciliation issues
                      <input
                        key="twist-editable"
                        ref={twistInputRef}
                        type="text"
                        defaultValue={formData.twist}
                        autoFocus
                        onFocus={(e) => {
                          // Move cursor to end when focused
                          const length = e.target.value.length
                          e.target.setSelectionRange(length, length)
                        }}
                        style={{
                          cursor: 'text'
                        }}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white cursor-text"
                        placeholder="Enter twist value (e.g., 121)"
                      />
                    ) : (
                      // Controlled read-only input for locked state
                      <input
                        key="twist-locked"
                        ref={twistInputRef}
                        type="text"
                        value={formData.twist}
                        readOnly
                        tabIndex={-1}
                        style={{
                          cursor: 'not-allowed'
                        }}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                        placeholder="Enter twist value (e.g., 121)"
                      />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        
                        if (isTwistEditable) {
                          // Save the value from uncontrolled input before locking
                          const currentValue = twistInputRef.current?.value || formData.twist
                          handleInputChange('twist', currentValue)
                        }
                        
                        // Toggle edit state
                        setIsTwistEditable(!isTwistEditable)
                      }}
                      className={`px-4 py-3 font-semibold rounded-lg transition-colors duration-200 ${
                        isTwistEditable
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                      title={isTwistEditable ? 'Done editing - Click to lock' : 'Edit twist - Click to edit'}
                    >
                      {isTwistEditable ? '✓' : '✎'}
                    </button>
                  </div>
                </div>

                {/* Date (Auto) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date (Auto)
                  </label>
                  <input
                    type="text"
                    value={getCurrentDate()}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>

                {/* Grade (Fixed) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Grade
                  </label>
                  <input
                    type="text"
                    value="AA"
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>

                {/* Cones */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cones
                  </label>
                  <input
                    type="number"
                    value={formData.cones}
                    onChange={(e) => handleInputChange('cones', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    placeholder="Enter number of cones (e.g., 22)"
                  />
                </div>

                {/* G.W (Gross Weight) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    G.W (Gross Weight)
                  </label>
                  <input
                    type="text"
                    value={stableWeight ? `${stableWeight.toFixed(3)} kg` : 'No weight data'}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                  {!stableWeight && (
                    <p className="text-sm text-red-600 mt-1">
                      Connect to Live Weight page to get current weight
                    </p>
                  )}
                </div>

                {/* N.W (Net Weight) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    N.W (Net Weight)
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={formData.netWeightType}
                      onChange={(e) => handleInputChange('netWeightType', e.target.value)}
                      className="px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Weight (kg)</option>
                    </select>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.netWeightValue}
                      onChange={(e) => handleInputChange('netWeightValue', e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      placeholder={formData.netWeightType === 'percentage' ? '2.4 (for 2.4%)' : '1.0 (for 1.0 kg)'}
                    />
                  </div>
                  {formData.netWeightValue && (
                    <div className="text-sm text-gray-600 mt-1">
                      <p>Net Weight: {calculateNetWeight()?.toFixed(3) || '0.000'} kg</p>
                      {formData.netWeightType === 'percentage' ? (
                        <p className="text-xs text-gray-500">
                          Calculation: {stableWeight?.toFixed(3)} - ({stableWeight?.toFixed(3)} × {formData.netWeightValue}%) = {stableWeight?.toFixed(3)} - {((stableWeight * parseFloat(formData.netWeightValue)) / 100).toFixed(4)} = {calculateNetWeight()?.toFixed(4)} kg
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Calculation: {stableWeight?.toFixed(3)} - {formData.netWeightValue} = {calculateNetWeight()?.toFixed(3)} kg
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Lot No */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lot No
                  </label>
                  <select
                    value={formData.lotNo}
                    onChange={(e) => handleInputChange('lotNo', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  >
                    <option value="061010">061010</option>
                    <option value="060606">060606</option>
                    <option value="666666">666666</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4 mt-8">
                <button
                  onClick={() => {
                    incrementBoxNumber()
                    setShowPreview(!showPreview)
                  }}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  {showPreview ? 'Hide Preview' : 'Generate Ticket'}
                </button>
                <button
                  onClick={printTicket}
                  disabled={!stableWeight || !formData.twist || !formData.cones}
                  className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  Print Ticket
                </button>
              </div>
            </div>

            {/* Preview Section */}
            {showPreview && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Ticket Preview</h2>
                
                <div className="bg-white border-2 border-black">
                  {/* Header */}
                  <div className="bg-yellow-400 p-4 text-center border-b-2 border-black">
                    <h3 className="text-lg font-bold text-black">SAQIB SILK INDUSTRY</h3>
                    <p className="text-sm text-black">Contact: [Your Phone Number]</p>
                  </div>
                  
                  {/* Body */}
                  <div className="p-4">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-bold">Box No:</span>
                            <span>{formData.boxNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">Twist:</span>
                            <span>{formData.twist || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">Date:</span>
                            <span>{getCurrentDate()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">Grade:</span>
                            <span>AA</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">Cones:</span>
                            <span>{formData.cones || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">G.W:</span>
                            <span>{stableWeight?.toFixed(3) || '0.000'} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">N.W:</span>
                            <span>{calculateNetWeight()?.toFixed(3) || '0.000'} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold">Lot No:</span>
                            <span>{formData.lotNo}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* QR Code */}
                      <div className="ml-4">
                        <QRCodeSVG
                          id="preview-qr"
                          value={generateQRData()}
                          size={80}
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="text-center text-xs text-gray-600 border-t border-gray-300 py-2">
                    {/* Address removed as requested */}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default TicketGenerator
