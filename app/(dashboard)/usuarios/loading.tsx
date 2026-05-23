export default function Loading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-1">
        <div className="h-6 bg-gray-200 rounded w-24" />
        <div className="h-4 bg-gray-100 rounded w-48" />
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="h-4 bg-gray-200 rounded w-40" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-44" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-14" />
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="h-3 bg-gray-100 rounded w-16" />
              <div className="h-3 bg-gray-100 rounded w-12" />
              <div className="h-7 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="h-4 bg-gray-200 rounded w-36" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="h-9 bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="h-9 bg-gray-200 rounded-lg w-28" />
      </div>
    </div>
  )
}
