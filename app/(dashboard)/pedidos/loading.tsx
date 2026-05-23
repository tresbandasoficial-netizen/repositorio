export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 bg-gray-200 rounded-lg w-32" />
        <div className="h-9 bg-gray-200 rounded-lg w-32" />
      </div>
      <div className="flex gap-3 mb-4">
        <div className="h-10 bg-gray-100 rounded-lg flex-1 max-w-sm" />
        <div className="h-10 bg-gray-100 rounded-lg w-40" />
        <div className="h-10 bg-gray-100 rounded-lg w-40" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-10 bg-gray-50 border-b border-gray-100" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 px-6 flex items-center gap-4">
            <div className="h-4 bg-gray-100 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded flex-1 max-w-xs" />
            <div className="h-6 bg-gray-100 rounded-full w-28" />
            <div className="h-4 bg-gray-100 rounded w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
