/* Central data model for the symbol-halftone engine. */

export type GridMode = 'square' | 'staggered' | 'hex' | 'random' | 'adaptive'
export type SourceMode = 'luminance' | 'alpha' | 'combined'
export type SizeMode = 'dark-large' | 'light-large' | 'constant'
export type RotationMode = 'fixed' | 'random' | 'luminance' | 'gradient'
export type GradientDir = 'along' | 'perpendicular'
export type ColorMode =
  | 'solid'
  | 'source'
  | 'source-image'
  | 'luminance-gradient'
  | 'x-gradient'
  | 'y-gradient'
  | 'radial'
export type OpacityMode = 'constant' | 'luminance' | 'alpha'
export type DensityMode = 'constant' | 'dark' | 'light'
export type SymbolSelectMode = 'random' | 'luminance' | 'sequential' | 'noise'
export type MaskSource = 'alpha' | 'luminance' | 'combined'
export type EdgeShapeMode = 'inside' | 'edges' | 'both'
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'lighten' | 'darken'
export type BackgroundMode = 'transparent' | 'white' | 'black' | 'custom'
export type PreviewQuality = 'low' | 'medium' | 'high'

export interface GradientStop {
  id: string
  pos: number // 0..1
  color: string // #rrggbb
}

export interface EditorSettings {
  grid: {
    mode: GridMode
    cellSize: number // image px
    spacingX: number // multiplier of cellSize
    spacingY: number
    offsetX: number // fraction of stepX
    offsetY: number
    rotation: number // degrees
    jitterX: number // fraction of stepX
    jitterY: number
    /** adaptive mode: smallest cell the quadtree may split down to, in image px */
    minCellSize: number
    /** adaptive mode: local contrast above which a cell splits (0..1) */
    detail: number
    /** adaptive mode: maximum number of splits */
    maxDepth: number
  }
  source: {
    mode: SourceMode
    invert: boolean
    brightness: number // -1..1
    contrast: number // -1..1
    gamma: number // 0.1..4
    blackPoint: number // 0..1
    whitePoint: number // 0..1
  }
  threshold: {
    min: number // 0..1
    max: number // 0..1
    soft: number // 0..0.5 feather width
    invert: boolean
  }
  size: {
    mode: SizeMode
    min: number // multiplier of cellSize
    max: number
    gamma: number
    jitter: number // 0..1
    clamp: boolean // clamp to cell bounds
  }
  rotation: {
    mode: RotationMode
    base: number // degrees
    jitter: number // degrees
    min: number // degrees, for luminance mapping
    max: number
    gradientDir: GradientDir
  }
  symbols: {
    pool: string[] // ordered ids (builtin + custom)
    enabled: Record<string, boolean>
    weights: Record<string, number>
    selectMode: SymbolSelectMode
    strokeWeight: number // fraction of symbol size
    noiseScale: number
  }
  color: {
    mode: ColorMode
    solid: string
    stops: GradientStop[]
    reverse: boolean
    hueShift: number // -180..180
    saturation: number // -1..1
    brightness: number // -1..1
    jitter: number // 0..1
  }
  opacity: {
    mode: OpacityMode
    min: number
    max: number
    gamma: number
    jitter: number
  }
  density: {
    value: number // 0..100
    mode: DensityMode
  }
  mask: {
    enabled: boolean
    source: MaskSource
    threshold: number
    feather: number
    invert: boolean
    silhouette: {
      enabled: boolean
      color: string
      opacity: number
    }
  }
  edges: {
    enabled: boolean
    mode: EdgeShapeMode
    threshold: number
    thickness: number // image px
    contrast: number // 0.1..4
    boost: number // 0..2 extra size/opacity on edge cells
  }
  random: {
    seed: number
  }
  layers: {
    background: { mode: BackgroundMode; color: string }
    original: { visible: boolean; opacity: number; blend: BlendMode }
    pattern: { visible: boolean; opacity: number; blend: BlendMode }
  }
}

export interface Preset {
  id: string
  name: string
  builtin?: boolean
  settings: EditorSettings
}

export interface TextSymbolDef {
  id: string
  label: string
  char: string
  font: string // css font-family stack
  bold: boolean
}

export interface CustomSymbolDef {
  id: string
  label: string
  kind: 'png' | 'svg'
  src: string // data url
  image: HTMLImageElement
  recolor: boolean
  aspect: number
}

export interface LoadedImage {
  name: string
  width: number
  height: number
  canvas: HTMLCanvasElement // full-resolution copy of the source
}

export interface SourceMaps {
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  scale: number // analysis px per image px
  lum: Float32Array // raw luminance 0..1
  alpha: Float32Array // 0..1
  rgb: Uint8ClampedArray // 3 bytes per analysis px
  edge: Float32Array | null // lazily built, 0..1
}

export interface RenderStats {
  elements: number
  cells: number
  ms: number
  outputWidth: number
  outputHeight: number
}
