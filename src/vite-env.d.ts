/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const svgContent: string
  export default svgContent
}