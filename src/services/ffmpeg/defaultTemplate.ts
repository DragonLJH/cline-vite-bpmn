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

  const transcodeConfig = ffmpegConfigAttr({

    type: 'ffmpeg',

    action: 'transcode',

    input: { source: 'input' },

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

    <bpmn:serviceTask id="ServiceTask_transcode" name="转码" implementation="##Other">

      <bpmn:extensionElements>

        <ffmpeg:config json="${transcodeConfig}" />

      </bpmn:extensionElements>

    </bpmn:serviceTask>

  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">

    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">

      <bpmndi:BPMNShape id="ServiceTask_transcode_di" bpmnElement="ServiceTask_transcode">

        <dc:Bounds x="280" y="80" width="100" height="80" />

      </bpmndi:BPMNShape>

    </bpmndi:BPMNPlane>

  </bpmndi:BPMNDiagram>

</bpmn:definitions>`

}



export const DEFAULT_BPMN_XML = createDefaultBpmnXml('Process_1', 'FFmpeg 工作流')



export function createParallelMergeBpmnXml(processId: string, processName: string): string {

  const branchConfig = ffmpegConfigAttr({

    type: 'ffmpeg',

    action: 'transcode',

    input: { source: 'input' },

    output: { format: 'mp4', overwrite: true, var: 'branch.output' },

    video: { codec: 'copy' },

    audio: { codec: 'copy' },

    global: { hideBanner: true, noStdin: true }

  })



  const mergeConfig = ffmpegConfigAttr({

    type: 'ffmpeg',

    action: 'concat',

    input: { source: 'merge' },

    output: { format: 'mp4', overwrite: true, var: 'merge.output' },

    concat: { mode: 'copy' },

    global: { hideBanner: true, noStdin: true }

  })



  return `<?xml version="1.0" encoding="UTF-8"?>

<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"

  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"

  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"

  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"

  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"

  xmlns:ffmpeg="http://cline-vite-bpmn/schema/ffmpeg"

  id="Definitions_parallel_merge"

  targetNamespace="http://bpmn.io/schema/bpmn"

  exporter="FFmpeg Workflow Designer"

  exporterVersion="1.0.0">

  <bpmn:process id="${processId}" name="${processName}" isExecutable="true">

    <bpmn:startEvent id="StartEvent_1" name="开始">

      <bpmn:outgoing>Flow_start_split</bpmn:outgoing>

    </bpmn:startEvent>

    <bpmn:parallelGateway id="ParallelGateway_split" name="分支">

      <bpmn:incoming>Flow_start_split</bpmn:incoming>

      <bpmn:outgoing>Flow_split_b1</bpmn:outgoing>

      <bpmn:outgoing>Flow_split_b2</bpmn:outgoing>

    </bpmn:parallelGateway>

    <bpmn:serviceTask id="ServiceTask_branch1" name="分支A" implementation="##Other">

      <bpmn:extensionElements>

        <ffmpeg:config json="${branchConfig}" />

      </bpmn:extensionElements>

      <bpmn:incoming>Flow_split_b1</bpmn:incoming>

      <bpmn:outgoing>Flow_b1_join</bpmn:outgoing>

    </bpmn:serviceTask>

    <bpmn:serviceTask id="ServiceTask_branch2" name="分支B" implementation="##Other">

      <bpmn:extensionElements>

        <ffmpeg:config json="${branchConfig}" />

      </bpmn:extensionElements>

      <bpmn:incoming>Flow_split_b2</bpmn:incoming>

      <bpmn:outgoing>Flow_b2_join</bpmn:outgoing>

    </bpmn:serviceTask>

    <bpmn:parallelGateway id="ParallelGateway_join" name="汇合">

      <bpmn:incoming>Flow_b1_join</bpmn:incoming>

      <bpmn:incoming>Flow_b2_join</bpmn:incoming>

      <bpmn:outgoing>Flow_join_merge</bpmn:outgoing>

    </bpmn:parallelGateway>

    <bpmn:serviceTask id="ServiceTask_merge" name="合并" implementation="##Other">

      <bpmn:extensionElements>

        <ffmpeg:config json="${mergeConfig}" />

      </bpmn:extensionElements>

      <bpmn:incoming>Flow_join_merge</bpmn:incoming>

      <bpmn:outgoing>Flow_merge_end</bpmn:outgoing>

    </bpmn:serviceTask>

    <bpmn:endEvent id="EndEvent_1" name="结束">

      <bpmn:incoming>Flow_merge_end</bpmn:incoming>

    </bpmn:endEvent>

    <bpmn:sequenceFlow id="Flow_start_split" sourceRef="StartEvent_1" targetRef="ParallelGateway_split" />

    <bpmn:sequenceFlow id="Flow_split_b1" sourceRef="ParallelGateway_split" targetRef="ServiceTask_branch1" />

    <bpmn:sequenceFlow id="Flow_split_b2" sourceRef="ParallelGateway_split" targetRef="ServiceTask_branch2" />

    <bpmn:sequenceFlow id="Flow_b1_join" sourceRef="ServiceTask_branch1" targetRef="ParallelGateway_join" />

    <bpmn:sequenceFlow id="Flow_b2_join" sourceRef="ServiceTask_branch2" targetRef="ParallelGateway_join" />

    <bpmn:sequenceFlow id="Flow_join_merge" sourceRef="ParallelGateway_join" targetRef="ServiceTask_merge" />

    <bpmn:sequenceFlow id="Flow_merge_end" sourceRef="ServiceTask_merge" targetRef="EndEvent_1" />

  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_parallel">

    <bpmndi:BPMNPlane id="BPMNPlane_parallel" bpmnElement="${processId}">

      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">

        <dc:Bounds x="152" y="102" width="36" height="36" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="ParallelGateway_split_di" bpmnElement="ParallelGateway_split">

        <dc:Bounds x="235" y="95" width="50" height="50" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="ServiceTask_branch1_di" bpmnElement="ServiceTask_branch1">

        <dc:Bounds x="340" y="40" width="100" height="80" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="ServiceTask_branch2_di" bpmnElement="ServiceTask_branch2">

        <dc:Bounds x="340" y="160" width="100" height="80" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="ParallelGateway_join_di" bpmnElement="ParallelGateway_join">

        <dc:Bounds x="495" y="95" width="50" height="50" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="ServiceTask_merge_di" bpmnElement="ServiceTask_merge">

        <dc:Bounds x="600" y="80" width="100" height="80" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">

        <dc:Bounds x="752" y="102" width="36" height="36" />

      </bpmndi:BPMNShape>

      <bpmndi:BPMNEdge id="Flow_start_split_di" bpmnElement="Flow_start_split">

        <di:waypoint x="188" y="120" />

        <di:waypoint x="235" y="120" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_split_b1_di" bpmnElement="Flow_split_b1">

        <di:waypoint x="260" y="95" />

        <di:waypoint x="260" y="80" />

        <di:waypoint x="340" y="80" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_split_b2_di" bpmnElement="Flow_split_b2">

        <di:waypoint x="260" y="145" />

        <di:waypoint x="260" y="200" />

        <di:waypoint x="340" y="200" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_b1_join_di" bpmnElement="Flow_b1_join">

        <di:waypoint x="440" y="80" />

        <di:waypoint x="520" y="80" />

        <di:waypoint x="520" y="95" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_b2_join_di" bpmnElement="Flow_b2_join">

        <di:waypoint x="440" y="200" />

        <di:waypoint x="520" y="200" />

        <di:waypoint x="520" y="145" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_join_merge_di" bpmnElement="Flow_join_merge">

        <di:waypoint x="545" y="120" />

        <di:waypoint x="600" y="120" />

      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="Flow_merge_end_di" bpmnElement="Flow_merge_end">

        <di:waypoint x="700" y="120" />

        <di:waypoint x="752" y="120" />

      </bpmndi:BPMNEdge>

    </bpmndi:BPMNPlane>

  </bpmndi:BPMNDiagram>

</bpmn:definitions>`

}

