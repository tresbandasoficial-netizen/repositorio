'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
}

export function ImagenProducto({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('pedido-items').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('pedido-items').getPublicUrl(path)
      onChange(data.publicUrl)
    }
    setUploading(false)
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
            className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 text-xs shadow-sm"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          {uploading ? (
            <span className="text-xs">Subiendo...</span>
          ) : (
            <>
              <span className="text-xl">📷</span>
              <span className="text-xs mt-0.5">Foto</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
