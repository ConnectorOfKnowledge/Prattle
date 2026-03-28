import { useRef } from 'react'

interface TextOutputPanelProps {
  editedText: string
  processedText: string
  rawText: string
  isRecording: boolean
  isProcessing: boolean
  trainingMode: boolean
  trainingSaved: boolean
  fontSize: number

  // Rating
  pendingRating: number
  ratingSubmitted: boolean
  onRatingSelect: (star: number) => void
  onRatingSubmit: () => void

  // Handlers
  onEditedTextChange: (text: string) => void
  onTrainingSavedReset: () => void
}

export default function TextOutputPanel({
  editedText, processedText, rawText,
  isRecording, isProcessing, trainingMode, trainingSaved, fontSize,
  pendingRating, ratingSubmitted, onRatingSelect, onRatingSubmit,
  onEditedTextChange, onTrainingSavedReset,
}: TextOutputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="flex flex-col flex-1 min-w-0 gap-2">
      {/* Training mode banner */}
      {trainingMode && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-amber-400">
          Training mode: Speak, review the output, make corrections, then hit Save Training.
        </div>
      )}

      <div className={`bg-cd-card rounded-2xl border p-3 flex-1 flex flex-col ${
        trainingMode ? 'border-amber-500/30' : 'border-white/5'
      }`}>
        <textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => { onEditedTextChange(e.target.value); onTrainingSavedReset() }}
          placeholder={isRecording
            ? "Recording in progress..."
            : trainingMode
              ? "Speak naturally, then edit the output to match how you actually want it..."
              : "Click the microphone to start dictating, or type directly here..."
          }
          className="w-full h-full bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-cd-text placeholder-cd-subtle/50 flex-1"
          style={{ fontSize: `${fontSize}px`, minHeight: '100px' }}
        />
      </div>

      {/* AI output comparison (training mode) */}
      {trainingMode && processedText && editedText !== processedText && (
        <div className="p-2 bg-cd-card rounded-xl text-xs border border-white/5">
          <span className="text-amber-400 font-medium">AI gave you: </span>
          <span className="text-cd-subtle">{processedText}</span>
        </div>
      )}

      {/* Star rating */}
      {!trainingMode && processedText && !isRecording && !isProcessing && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-cd-subtle shrink-0">Rate this:</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => { if (!ratingSubmitted) onRatingSelect(star) }}
                disabled={ratingSubmitted}
                className={`text-lg leading-none transition-colors ${
                  ratingSubmitted
                    ? star <= pendingRating ? 'text-amber-400' : 'text-white/10'
                    : star <= pendingRating ? 'text-amber-400 hover:text-amber-300' : 'text-white/20 hover:text-amber-300'
                }`}
                title={`Rate ${star} star${star !== 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
          {pendingRating > 0 && !ratingSubmitted && (
            <button
              onClick={onRatingSubmit}
              className="text-xs px-2 py-0.5 rounded-lg bg-cd-accent hover:bg-cd-accent/80 text-white transition-colors"
            >
              Submit
            </button>
          )}
          {ratingSubmitted && (
            <span className="text-xs text-green-400">Thanks!</span>
          )}
        </div>
      )}

      {/* Original transcript */}
      {!trainingMode && rawText && (
        <div className="p-2 bg-cd-card rounded-xl border border-white/5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium text-cd-subtle">Original transcript</span>
          </div>
          <p className="text-xs text-cd-subtle/80 leading-relaxed select-text">{rawText}</p>
        </div>
      )}
    </div>
  )
}
