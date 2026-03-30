import React from 'react'
import './index.scss'

// 使用 ?raw 后缀导入 SVG 内容
import plusSvg from '../../assets/icons/plus.svg?raw'
import closeSvg from '../../assets/icons/close.svg?raw'
import checkSvg from '../../assets/icons/check.svg?raw'
import warningSvg from '../../assets/icons/warning.svg?raw'
import clockSvg from '../../assets/icons/clock.svg?raw'
import copySvg from '../../assets/icons/copy.svg?raw'
import deleteSvg from '../../assets/icons/delete.svg?raw'
import searchSvg from '../../assets/icons/search.svg?raw'
import listSvg from '../../assets/icons/list.svg?raw'
import settingsSvg from '../../assets/icons/settings.svg?raw'
import chevronLeftSvg from '../../assets/icons/chevron-left.svg?raw'
import chevronRightSvg from '../../assets/icons/chevron-right.svg?raw'
import chevronUpSvg from '../../assets/icons/chevron-up.svg?raw'
import chevronDownSvg from '../../assets/icons/chevron-down.svg?raw'
import saveSvg from '../../assets/icons/save.svg?raw'
import folderSvg from '../../assets/icons/folder.svg?raw'
import documentSvg from '../../assets/icons/document.svg?raw'
import editSvg from '../../assets/icons/edit.svg?raw'

// 图标名称类型
export type IconName =
  | 'plus'
  | 'close'
  | 'check'
  | 'warning'
  | 'clock'
  | 'copy'
  | 'delete'
  | 'search'
  | 'list'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'save'
  | 'folder'
  | 'document'
  | 'edit'

interface IconProps {
  name: IconName
  size?: number | string
  color?: string
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  title?: string
}

// SVG 图标映射
const iconMap: Record<IconName, string> = {
  plus: plusSvg,
  close: closeSvg,
  check: checkSvg,
  warning: warningSvg,
  clock: clockSvg,
  copy: copySvg,
  delete: deleteSvg,
  search: searchSvg,
  list: listSvg,
  settings: settingsSvg,
  'chevron-left': chevronLeftSvg,
  'chevron-right': chevronRightSvg,
  'chevron-up': chevronUpSvg,
  'chevron-down': chevronDownSvg,
  save: saveSvg,
  folder: folderSvg,
  document: documentSvg,
  edit: editSvg
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
      dangerouslySetInnerHTML={{ __html: iconMap[name] }}
    />
  )
}

export default Icon
