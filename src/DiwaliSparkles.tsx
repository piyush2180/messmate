import { useEffect, useState } from "react"

// Diwali: a short show of white sparkles each time the site opens or reloads. Taps go straight through it,
// and phones set to reduce motion skip it. Remove this file and its line in main.tsx after the festival.
// White on the cream page needs a warm glow around each spark, or it disappears.
const GLOWS = ["rgba(255, 196, 70, 0.95)", "rgba(255, 170, 60, 0.9)", "rgba(255, 220, 140, 0.95)"]
const DURATION_MS = 4200

type Spark = { left: number; top: number; x: number; y: number; delay: number; glow: string; size: number }
type Star = { left: number; top: number; size: number; delay: number; glow: string }
type Glitter = { left: number; delay: number; fall: number; drift: number; size: number }

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

function makeSparkles() {
  // Bursts reach less far on a phone-width screen, so they stay on screen
  const scale = Math.max(0.55, Math.min(1, window.innerWidth / 800))
  const sparks: Spark[] = []
  for (let b = 0; b < 5; b++) {
    const left = 12 + ((b * 19 + Math.random() * 10) % 76)
    const top = 12 + Math.random() * 40
    const count = 22
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.15
      const reach = (80 + Math.random() * 90) * scale
      sparks.push({
        left,
        top,
        x: Math.cos(angle) * reach,
        y: Math.sin(angle) * reach,
        delay: b * 320,
        glow: pick(GLOWS),
        size: 5 + Math.random() * 4,
      })
    }
  }
  const stars: Star[] = Array.from({ length: 28 }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 85,
    size: 12 + Math.random() * 16,
    delay: 200 + Math.random() * 1800,
    glow: pick(GLOWS),
  }))
  // Fine white glitter that drifts down after the bursts
  const glitter: Glitter[] = Array.from({ length: 40 }, () => ({
    left: Math.random() * 100,
    delay: 600 + Math.random() * 1600,
    fall: 40 + Math.random() * 45,
    drift: (Math.random() - 0.5) * 60,
    size: 2 + Math.random() * 3,
  }))
  return { sparks, stars, glitter }
}

const CSS = `
.diwali-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; overflow: hidden; }
.diwali-spark { position: absolute; border-radius: 50%; opacity: 0; background: #fff;
  box-shadow: 0 0 6px 2px var(--g), 0 0 14px 4px var(--g);
  animation: diwali-burst 1.6s cubic-bezier(0.15, 0.7, 0.3, 1) var(--d) forwards; }
.diwali-star { position: absolute; line-height: 1; opacity: 0; color: #fff;
  text-shadow: 0 0 4px #fff, 0 0 10px var(--g), 0 0 18px var(--g);
  animation: diwali-twinkle 1.8s ease-in-out var(--d) forwards; }
.diwali-glitter { position: absolute; top: -2vh; border-radius: 50%; opacity: 0; background: #fff;
  box-shadow: 0 0 4px 1px rgba(255, 196, 70, 0.9);
  animation: diwali-fall 2.4s ease-in var(--d) forwards; }
@keyframes diwali-burst {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  65% { opacity: 1; }
  100% { transform: translate(var(--x), calc(var(--y) + 50px)) scale(0.25); opacity: 0; }
}
@keyframes diwali-twinkle {
  0% { opacity: 0; transform: scale(0.2) rotate(0deg); }
  35% { opacity: 1; transform: scale(1.15) rotate(30deg); }
  60% { opacity: 0.6; transform: scale(0.8) rotate(50deg); }
  80% { opacity: 1; transform: scale(1) rotate(70deg); }
  100% { opacity: 0; transform: scale(0.3) rotate(90deg); }
}
@keyframes diwali-fall {
  0% { transform: translate(0, 0); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--fall)); opacity: 0; }
}
`

export default function DiwaliSparkles() {
  const [show, setShow] = useState(() => {
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      return true
    }
  })
  const [{ sparks, stars, glitter }] = useState(makeSparkles)
  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [show])
  if (!show) return null
  return (
    <div className="diwali-layer" aria-hidden="true">
      <style>{CSS}</style>
      {sparks.map((s, i) => (
        <span
          key={`s${i}`}
          className="diwali-spark"
          style={
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              margin: -s.size / 2,
              "--x": `${s.x}px`,
              "--y": `${s.y}px`,
              "--d": `${s.delay}ms`,
              "--g": s.glow,
            } as React.CSSProperties
          }
        />
      ))}
      {stars.map((s, i) => (
        <span
          key={`t${i}`}
          className="diwali-star"
          style={{ left: `${s.left}%`, top: `${s.top}%`, fontSize: s.size, "--d": `${s.delay}ms`, "--g": s.glow } as React.CSSProperties}
        >
          ✦
        </span>
      ))}
      {glitter.map((g, i) => (
        <span
          key={`g${i}`}
          className="diwali-glitter"
          style={
            {
              left: `${g.left}%`,
              width: g.size,
              height: g.size,
              "--d": `${g.delay}ms`,
              "--fall": `${g.fall}vh`,
              "--dx": `${g.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
