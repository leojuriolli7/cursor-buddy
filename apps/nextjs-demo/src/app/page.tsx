"use client"

import { highlight, languages } from "prismjs"
import { useState } from "react"
import Editor from "react-simple-code-editor"
import "prismjs/components/prism-typescript"

const initialCode = `function twoSum(nums, target) {
  const map = new Map();

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];

    if (map.has(complement)) {
      return [complement, nums[i]];
    }

    map.set(nums[i], i);
  }

  return [];
}

// Test case
const nums = [3, 2, 4];
const target = 6;
console.log(twoSum(nums, target)); // Expected: [1, 2]`

export default function CodeDemoPage() {
  const [code, setCode] = useState(initialCode)
  const [output, setOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)

  const runCode = () => {
    setIsRunning(true)
    setOutput("")

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args) => {
      logs.push(
        args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg) : String(arg),
          )
          .join(" "),
      )
    }

    try {
      // eslint-disable-next-line no-eval
      eval(code)
      setOutput(logs.join("\n") || "No output")
    } catch (error) {
      setOutput(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      console.log = originalLog
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  CodeLearn
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Daily Coding Challenge
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
                <span>Streak: 5 days</span>
              </div>
              <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-teal-600 rounded-full" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Problem */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full">
                      EASY
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Two Sum
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      Success Rate: 47%
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                    Two Sum
                  </h2>
                  <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
                    <p className="text-slate-600 dark:text-slate-300">
                      Given an array of integers <code>nums</code> and an
                      integer <code>target</code>, return <em>indices</em> of
                      the two numbers such that they add up to{" "}
                      <code>target</code>.
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      You may assume that each input would have{" "}
                      <strong>exactly one solution</strong>, and you may not use
                      the same element twice.
                    </p>

                    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 mt-4">
                      <p className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                        Example 1:
                      </p>
                      <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>Input:</strong> nums = [2,7,11,15], target = 9
                        </p>
                        <p>
                          <strong>Output:</strong> [0,1]
                        </p>
                        <p className="text-slate-500">
                          <strong>Explanation:</strong> Because nums[0] +
                          nums[1] == 9, we return [0, 1].
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                        Constraints:
                      </p>
                      <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc list-inside">
                        <li>2 ≤ nums.length ≤ 10⁴</li>
                        <li>-10⁹ ≤ nums[i] ≤ 10⁹</li>
                        <li>-10⁹ ≤ target ≤ 10⁹</li>
                        <li>Only one valid answer exists.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hint Card */}
            <div className="bg-linear-to-br from-blue-500 to-gray-800 rounded-2xl p-5 text-white">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Stuck?</h4>
                  <p className="text-amber-100 text-sm leading-relaxed">
                    Hold{" "}
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-xs font-mono">
                      Ctrl+Alt
                    </kbd>{" "}
                    and ask the AI assistant. Try: "Why is my code failing?" or
                    "Help me debug"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Code Editor */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Solution.js
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runCode}
                    disabled={isRunning}
                    id="run-code-btn"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Run
                  </button>
                  <button
                    id="submit-btn"
                    className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>

              <div className="relative">
                <Editor
                  value={code}
                  onValueChange={setCode}
                  highlight={(code) =>
                    highlight(code, languages.javascript, "javascript")
                  }
                  padding={16}
                  textareaId="code-editor"
                  className="font-mono text-sm bg-[#fafafa] dark:bg-gray-900"
                  style={{
                    fontFamily: '"Fira Code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: "320px",
                  }}
                />
              </div>
            </div>

            {/* Console Output */}
            <div
              id="console-output"
              className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/50">
                <span className="text-xs font-medium text-slate-400">
                  Console Output
                </span>
              </div>
              <div className="p-4 min-h-20">
                {output ? (
                  <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
                    {output}
                  </pre>
                ) : (
                  <span className="text-sm text-slate-500 italic">
                    Click "Run" to see output...
                  </span>
                )}
              </div>
            </div>

            {/* Test Results */}
            <div
              id="test-results"
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Test Cases
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                      <span className="text-amber-600 dark:text-amber-400 text-xs">
                        ?
                      </span>
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Test Case 1: nums = [3,2,4], target = 6
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Not run</span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-slate-400 text-xs">-</span>
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Test Case 2: nums = [2,7,11,15], target = 9
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Locked</span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-slate-400 text-xs">-</span>
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Test Case 3: nums = [3,3], target = 6
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Locked</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
