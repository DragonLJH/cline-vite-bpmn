import { serializeFfmpegJobConfig } from './jobConfig'

import type { FfmpegJobConfig } from './jobConfig'

function ffmpegConfigAttr(config: FfmpegJobConfig): string {
  return serializeFfmpegJobConfig(config)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function createDefaultBpmnXml(processId: string, processName: string): string {
  const probeConfig = ffmpegConfigAttr({
    type: 'ffmpeg',
    action: 'probe',
    input: { source: 'input' },
    output: { var: 'probe.info' },
    global: { hideBanner: true, noStdin: true }
  })

  const transcodeConfig = ffmpegConfigAttr({
    type: 'ffmpeg',
    action: 'transcode',
    input: { source: 'prev' },
    output: { format: 'mp4', overwrite: true, var: 'transcode.output' },
    video: { codec: 'libopenh264', bitrate: '1200k' },
    audio: { codec: 'aac' },
    global: { hideBanner: true, noStdin: true }
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:ffmpeg="http://cline-vite-bpmn/schema/ffmpeg"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="FFmpeg Workflow Designer"
  exporterVersion="1.0.0">
  <bpmn:process id="${processId}" name="${processName}" isExecutable="true">
    <bpmn:serviceTask id="ServiceTask_probe" name="探测信息" implementation="##Other">
      <bpmn:extensionElements>
        <ffmpeg:config json="${probeConfig}" />
      </bpmn:extensionElements>
      <bpmn:outgoing>Flow_probe_transcode</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="ServiceTask_transcode" name="转码" implementation="##Other">
      <bpmn:extensionElements>
        <ffmpeg:config json="${transcodeConfig}" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_probe_transcode</bpmn:incoming>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_probe_transcode" sourceRef="ServiceTask_probe" targetRef="ServiceTask_transcode" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="ServiceTask_probe_di" bpmnElement="ServiceTask_probe">
        <dc:Bounds x="180" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_transcode_di" bpmnElement="ServiceTask_transcode">
        <dc:Bounds x="360" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_probe_transcode_di" bpmnElement="Flow_probe_transcode">
        <di:waypoint x="280" y="120" />
        <di:waypoint x="360" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

export const DEFAULT_BPMN_XML = createDefaultBpmnXml('Process_1', 'FFmpeg 工作流')
