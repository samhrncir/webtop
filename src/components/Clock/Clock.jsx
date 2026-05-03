import { useState, useEffect } from 'react'
import { useSettings } from '../../context/SettingsContext.jsx'
import './Clock.css'

export default function Clock() {
  const [time, setTime] = useState(new Date())
  const { settings } = useSettings()

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  let hours = time.getHours()
  const minutes = time.getMinutes().toString().padStart(2, '0')
  let suffix = ''

  if (settings.timeFormat === '12') {
    suffix = hours >= 12 ? ' PM' : ' AM'
    hours = hours % 12 || 12
  }

  return (
    <div className="clock">
      <img src="/globe.svg" className="clock-globe" aria-hidden="true" />
      {hours}<span className="clock-colon">:</span>{minutes}
      {suffix && <span className="clock-suffix">{suffix}</span>}
    </div>
  )
}
