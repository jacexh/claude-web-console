import { useState, useCallback } from "react"
import { Check, Monitor, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"

interface QuestionOption {
  label: string
  description?: string
}

interface QuestionItem {
  question: string
  header?: string
  options?: QuestionOption[]
}

interface QuestionCardProps {
  input: Record<string, unknown>
  onAnswer: (answer: string) => void
  answered?: boolean
}

/** Extract questions from the various SDK input formats */
function parseQuestions(input: Record<string, unknown>): QuestionItem[] {
  if (Array.isArray(input.questions)) {
    return input.questions as QuestionItem[]
  }
  const q = (input.question ?? input.text) as string | undefined
  if (q) return [{ question: q }]
  return []
}

export function QuestionCard({ input, onAnswer, answered }: QuestionCardProps) {
  const questions = parseQuestions(input)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [freeText, setFreeText] = useState<Record<number, string>>({})
  const [allSubmitted, setAllSubmitted] = useState(answered ?? false)

  const totalQuestions = questions.length
  const answeredCount = Object.keys(answers).length

  const handleSelectOption = useCallback((qIndex: number, label: string) => {
    if (allSubmitted) return
    const next = { ...answers, [qIndex]: label }
    setAnswers(next)
    if (Object.keys(next).length >= totalQuestions) {
      setAllSubmitted(true)
      const combined = questions
        .map((_, i) => next[i])
        .filter(Boolean)
        .join("\n")
      onAnswer(combined)
    }
  }, [allSubmitted, answers, totalQuestions, questions, onAnswer])

  const handleFreeTextSubmit = useCallback((qIndex: number) => {
    const text = (freeText[qIndex] ?? "").trim()
    if (!text || allSubmitted) return
    handleSelectOption(qIndex, text)
  }, [freeText, allSubmitted, handleSelectOption])

  if (questions.length === 0) return null

  return (
    <div className="ml-10 my-2 space-y-3 max-w-xl">
      {questions.map((q, i) => {
        const isAnswered = allSubmitted || answers[i] != null
        const hasOptions = q.options && q.options.length > 0

        return (
          <div key={i} className="bg-[#f0f5ff] border border-[#c5d9ff] rounded-lg overflow-hidden shadow-soft">
            {/* Question header */}
            <div className="px-4 py-3 border-b border-[#c5d9ff]/50">
              {q.header && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary/60 mb-1">
                  {q.header}
                </div>
              )}
              <p className="text-sm text-foreground font-medium leading-relaxed">{q.question}</p>
            </div>

            {/* Answer area */}
            <div className="px-4 py-3">
              {isAnswered ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-success" />
                  <span>{answers[i] ?? "Answered"}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {hasOptions && (
                    <div className="flex flex-wrap gap-2">
                      {q.options!.map((opt, j) => (
                        <button
                          key={j}
                          onClick={() => handleSelectOption(i, opt.label)}
                          className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded border transition-colors",
                            j === 0
                              ? "bg-[#c5d9ff] hover:bg-[#9cbdfb] text-primary border-[#9cbdfb]"
                              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                          )}
                        >
                          {opt.label}
                          {opt.description && (
                            <span className="text-muted-foreground font-normal ml-1.5">— {opt.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={freeText[i] ?? ""}
                      onChange={(e) => setFreeText((prev) => ({ ...prev, [i]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleFreeTextSubmit(i)
                        }
                      }}
                      placeholder={hasOptions ? "Or type your own answer..." : "Type your answer..."}
                      className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => handleFreeTextSubmit(i)}
                      disabled={!(freeText[i] ?? "").trim()}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-sm font-medium hover:bg-slate-50 shadow-sm whitespace-nowrap disabled:opacity-40"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {totalQuestions > 1 && !allSubmitted && answeredCount > 0 && (
        <div className="text-xs text-muted-foreground ml-2">
          {answeredCount} / {totalQuestions} answered
        </div>
      )}
    </div>
  )
}
