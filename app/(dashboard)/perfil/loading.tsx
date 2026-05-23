export default function Loading() {
  return (
    <div className="p-6 max-w-lg mx-auto animate-pulse">
      <div className="h-7 bg-gray-200 rounded w-20 mb-6" />

      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow p-6 space-y-4">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="space-y-3">
              <div className="h-3 bg-gray-100 rounded w-24" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
            <div className="h-10 bg-gray-200 rounded-lg w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
