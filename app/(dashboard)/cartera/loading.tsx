export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-pulse">
      <div className="h-7 bg-gray-200 rounded w-24 mb-6" />

      <div className="grid grid-cols-2 gap-4 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow p-5 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-28" />
            <div className="h-7 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>

      <div className="mb-4 h-10 bg-gray-200 rounded-lg w-full" />

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-40" />
                <div className="h-3 bg-gray-100 rounded w-24" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-red-100 rounded w-20" />
              <div className="h-6 bg-gray-100 rounded w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
