'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <span className="text-4xl font-display font-bold text-primary">Strategy</span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-8">
          <div className="text-6xl font-bold text-stone-400 mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-stone-900 mb-4">
            Something went wrong
          </h1>
          <p className="text-stone-600 mb-6">
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}
