'use client'

// Select que envía su formulario (GET) apenas el usuario escoge una opción,
// para no obligar a oprimir "Filtrar" en formularios de server components.
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e)
        e.currentTarget.form?.requestSubmit()
      }}
    />
  )
}
