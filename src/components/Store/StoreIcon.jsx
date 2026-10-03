import React from 'react'
import { useIconSource } from '../../hooks/useIconSource.js'
import { getInitialLetter, getColorForName } from '../../utils/favicon.js'

// A listing's icon tile: the same custom icon -> brand mark -> favicon chain
// a bookmark uses, so the card shows exactly what the installed app will
export default function StoreIcon({ app, size = 56 }) {
  const { src, onError } = useIconSource({ name: app.name, url: app.url, icon: app.icon_url })
  const style = { width: size, height: size }
  if (!src) {
    return (
      <div className="store-icon store-icon--letter" style={{ ...style, background: getColorForName(app.name) }} aria-hidden="true">
        {getInitialLetter(app.name)}
      </div>
    )
  }
  return (
    <div className="store-icon" style={style}>
      <img src={src} alt="" onError={onError} draggable={false} />
    </div>
  )
}
