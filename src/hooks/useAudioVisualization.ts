import { useState, useEffect } from 'react'
import { speechService } from '../services/speechService'

const NUM_BARS = 24
const FRAME_INTERVAL_MS = 33 // ~30fps

/**
 * Polls the speech service's analyser node for frequency data
 * and returns an array of normalized bar levels for visualization.
 */
export function useAudioVisualization(isRecording: boolean): number[] {
  const [audioData, setAudioData] = useState<number[]>([])

  useEffect(() => {
    if (!isRecording) {
      setAudioData([])
      return
    }

    const analyser = speechService.getAnalyserNode()
    if (!analyser) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let animId: number
    let lastUpdate = 0

    const update = (timestamp: number) => {
      animId = requestAnimationFrame(update)
      if (timestamp - lastUpdate < FRAME_INTERVAL_MS) return
      lastUpdate = timestamp

      analyser.getByteFrequencyData(dataArray)
      const step = Math.floor(bufferLength / NUM_BARS)
      const bars = Array.from({ length: NUM_BARS }, (_, i) => {
        const start = i * step
        const end = Math.min(start + step, bufferLength)
        let sum = 0
        for (let j = start; j < end; j++) sum += dataArray[j]
        return (sum / (end - start)) / 255
      })
      setAudioData(bars)
    }

    animId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animId)
  }, [isRecording])

  return audioData
}
