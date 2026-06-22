import type { FfmpegJobConfig } from './jobConfig'

import {

  DEFAULT_FFMPEG_JOB_CONFIG,

  FFMPEG_ACTION_LABELS,

  parseFfmpegJobConfig,

  serializeFfmpegJobConfig

} from './jobConfig'



const FFMPEG_NS = 'http://cline-vite-bpmn/schema/ffmpeg'



export const DEFAULT_FFMPEG_CONFIG = DEFAULT_FFMPEG_JOB_CONFIG



export function parseFfmpegConfigJson(json?: string | null): FfmpegJobConfig {

  return parseFfmpegJobConfig(json)

}



export function serializeFfmpegConfig(config: FfmpegJobConfig): string {

  return serializeFfmpegJobConfig(config)

}



function isFfmpegConfigElement(value: { $type?: string }): boolean {
  const type = value.$type?.toLowerCase()
  return type === 'ffmpeg:config'
}

export function readFfmpegConfigFromBusinessObject(businessObject: any): FfmpegJobConfig {

  const extensionElements = businessObject?.extensionElements

  if (!extensionElements?.values) {

    return { ...DEFAULT_FFMPEG_JOB_CONFIG }

  }



  const configEl = extensionElements.values.find(isFfmpegConfigElement)



  const json = configEl?.json ?? configEl?.$attrs?.json
  return parseFfmpegJobConfig(json)

}



export function createFfmpegConfigElement(moddle: any, config: FfmpegJobConfig) {

  return moddle.create('ffmpeg:Config', {

    json: serializeFfmpegJobConfig(config)

  })

}



export function updateFfmpegConfigOnElement(moddle: any, businessObject: any, config: FfmpegJobConfig) {

  const extensionElements = businessObject.extensionElements || moddle.create('bpmn:ExtensionElements')

  const values = extensionElements.values ? [...extensionElements.values] : []



  const existingIndex = values.findIndex(isFfmpegConfigElement)

  const configElement = createFfmpegConfigElement(moddle, config)



  if (existingIndex >= 0) {

    values[existingIndex] = configElement

  } else {

    values.push(configElement)

  }



  extensionElements.values = values

  return extensionElements

}



function findFfmpegConfigElement(serviceTaskElement: Element): Element | null {
  const lowerCase = serviceTaskElement.getElementsByTagNameNS(FFMPEG_NS, 'config')
  if (lowerCase.length > 0) return lowerCase[0]

  const upperCase = serviceTaskElement.getElementsByTagNameNS(FFMPEG_NS, 'Config')
  if (upperCase.length > 0) return upperCase[0]

  const extensionElements = serviceTaskElement.querySelector(
    'extensionElements, bpmn\\:extensionElements'
  )
  if (extensionElements) {
    const configs = extensionElements.querySelectorAll(
      'ffmpeg\\:config, ffmpeg\\:Config, config, Config'
    )
    if (configs.length > 0) return configs[0]
  }

  return serviceTaskElement.querySelector(
    'ffmpeg\\:config, ffmpeg\\:Config, config, Config'
  )
}

function readConfigJsonFromElement(configElement: Element | null): string | null {
  if (!configElement) return null
  return configElement.getAttribute('json')
    || configElement.getAttributeNS(FFMPEG_NS, 'json')
}

export function parseFfmpegConfigFromXmlElement(element: Element): FfmpegJobConfig {
  const configElement = findFfmpegConfigElement(element)
  const json = readConfigJsonFromElement(configElement)
  if (!json) {
    return { ...DEFAULT_FFMPEG_JOB_CONFIG }
  }
  return parseFfmpegJobConfig(json)
}



export const FFMPEG_OPERATION_LABELS = FFMPEG_ACTION_LABELS


