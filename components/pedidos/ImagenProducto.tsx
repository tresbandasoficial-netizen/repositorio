'use client'

import { useState, useRef } from 'react'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
}

export function ImagenProducto({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    const url = await uploadPedidoImage(file)
    if (url) onChange(url)
    setUploading(false)
  }

  function handlePaste(e: React.ClipboardEvent) {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.stopPropagation() // evita que el form-level handler haga doble upload
          handleFile(file)
          break
        }
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFile(file)
  }

  return (
    <div className="w-20 h-20 flex-shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {value ? (
        <div className="relative w-20 h-20">
          <img src={value} alt="Producto" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 text-xs shadow-sm z-10"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="button"
          aria-label="Imagen del producto"
          onClick={() => inputRef.current?.click()}
          onPaste={handlePaste}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
          className={`w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer select-none outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            dragOver
              ? 'border-blue-500 bg-blue-50 text-blue-500'
              : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500'
          }`}
        >
          {uploading ? (
            <span className="text-[10px] text-center px-1">Subiendo…</span>
          ) : dragOver ? (
            <><span className="text-xl">📥</span><span className="text-[10px] mt-0.5">Soltar</span></>
          ) : (
            <>
              <span className="text-xl">📷</span>
              <span className="text-[10px] mt-0.5 text-center leading-tight px-1">
                Foto<br /><span className="text-gray-300">Ctrl+V</span>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
