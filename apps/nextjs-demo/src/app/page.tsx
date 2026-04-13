export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-900 p-8">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-800 shadow-lg p-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
          Cursor Buddy AI Assistant Demo
        </h1>

        <p className="text-zinc-600 dark:text-zinc-300 mb-6">
          An assistant that lives in your cursor.
        </p>

        <p className="text-zinc-600 dark:text-zinc-300 mb-6">
          Hold{" "}
          <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-700 rounded text-sm font-mono">
            Ctrl+Alt
          </kbd>{" "}
          to speak. Try asking:
        </p>

        <ul className="text-zinc-600 dark:text-zinc-300 mb-6 space-y-2 text-sm">
          <li>&quot;What do you see on this page?&quot;</li>
          <li>&quot;Point to the Submit button&quot;</li>
          <li>&quot;What color is the Cancel button?&quot;</li>
        </ul>

        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Submit
          </button>
          <button
            type="button"
            className="flex-1 px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
