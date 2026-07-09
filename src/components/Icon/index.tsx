import React from 'react'
import './index.scss'

const iconModules = import.meta.glob('@/assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const iconMap = Object.fromEntries(
  Object.entries(iconModules).map(([path, svg]) => {
    const name = path.match(/\/([^/]+)\.svg$/)?.[1]
    return [name, svg]
  }),
) as Record<string, string>

interface IconProps {
  name: string
  size?: number | string
  color?: string
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  title?: string
}

const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color,
  className = '',
  style,
  onClick,
  title
}) => {
  const svg = iconMap[name]

  if (!svg) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] 未找到图标: ${name}`)
    }
    return null
  }

  const sizeValue = typeof size === 'number' ? `${size}px` : size

  const iconStyle: React.CSSProperties = {
    width: sizeValue,
    height: sizeValue,
    color: color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  }

  return (
    <span
      className={`icon icon--${name} ${className} ${onClick ? 'icon--clickable' : ''}`}
      style={iconStyle}
      onClick={onClick}
      title={title}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default Icon
