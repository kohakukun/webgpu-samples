import { makeBasicExample } from '../../components/basicExample';
import glslangModule from '../../glslang';

const primID0 = [42];
const primID1 = [16];

async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const context = canvas.getContext('webgpu');

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const indices = [0, 2, 1, 2, 0, 3];
  const vertices = [-0.2, 0, 0.1, 0.6, 0, 0.1, 0.6, 0.2, 0.1, -0.2, 0.2, 0.1];

  const bboxLocalMin0 = [1, -100, 150, 1];
  const padding0 = [7, 7, 7];

  const bboxLocalMin1 = [-430, -145, 0, 1];
  const usePadding = true;
  let constParamsData0;
  let constParamsData1;
  if (usePadding) {
    constParamsData0 = [].concat(bboxLocalMin0, primID0, padding0);
    constParamsData1 = [].concat(bboxLocalMin1, primID1, padding0);
  } else {
    constParamsData0 = [].concat(bboxLocalMin0, primID0);
    constParamsData1 = [].concat(bboxLocalMin1, primID1);
  }
  const constParamsData = [].concat(constParamsData0, constParamsData1);

  // Create the model index buffer.
  const constParamsBuffer = device.createBuffer({
    size: constParamsData.length * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  new Uint32Array(constParamsBuffer.getMappedRange()).set(constParamsData);
  constParamsBuffer.unmap();

  // Create the model index buffer.
  const indexBuffer = device.createBuffer({
    size: indices.length * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint32Array(indexBuffer.getMappedRange()).set(indices);
  indexBuffer.unmap();

  // Create vertex position
  const positionBuffer = device.createBuffer({
    size: vertices.length * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(positionBuffer.getMappedRange()).set(vertices);
  positionBuffer.unmap();

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.vertex,
        })
        : device.createShaderModule({
          code: glslShaders.vertex,
          transform: (glsl) => glslang.compileGLSL(glsl, 'vertex'),
        }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            }
          ],
        },
      ],
    },
    fragment: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.fragment,
        })
        : device.createShaderModule({
          code: glslShaders.fragment,
          transform: (glsl) => glslang.compileGLSL(glsl, 'fragment'),
        }),
      entryPoint: 'main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: constParamsBuffer,
          offset: 0,
          size: constParamsData.length * Uint32Array.BYTES_PER_ELEMENT,
        },
      },
    ],
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.5, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setVertexBuffer(0, positionBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.drawIndexed(6);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  return frame;
}

const glslShaders = {
  vertex: `#version 450
  struct ConstantData {
    vec4 transform;
    int primID;
  };

  layout(location = 0) in vec3 position;
  layout(location = 0) out vec4 fragColor;
  layout(std140, binding = 0) readonly buffer ssbo_constantPrimvars { ConstantData constantPrimvars[];};

void main() {
  if (constantPrimvars[0].primID == ${primID0[0]} && constantPrimvars[1].primID == ${primID1[0]}) {
      fragColor = vec4(1.0, 0.0, 1.0, 1); // correct
  } else {
    fragColor = vec4(0.0, 0.0, 1.0, 1);
  }
  gl_Position = vec4(position, 1.0);
}
`,

  fragment: `#version 450
  
  layout(location = 0) in vec4 fragColor;
  layout(location = 0) out vec4 outColor;

  void main() {
      outColor = fragColor;
  }
`,
};

const wgslShaders = {
  vertex: `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragColor : vec4<f32>,
};

struct ConstantData {
  transform: vec4<f32>,
  primID: i32 ,
};

@binding(0) @group(0) var<storage, read> constantPrimvars : array<ConstantData>;

@vertex
fn main(
  @location(0) position : vec3<f32>)
     -> VertexOutput {
  var color : vec4<f32>;
  if (constantPrimvars[0].primID == ${primID0[0]} && constantPrimvars[1].primID == ${primID1[0]}) {
    color = vec4(1.0, 0.0, 1.0, 1); // correct
  } else {
    color = vec4(0.0, 0.0, 1.0, 1);
  }

  return VertexOutput(vec4<f32>(position, 1), color);
}
`,
  fragment: `
  struct MyOutputs {
    @location(0) color: vec4<f32>
  }

@fragment
fn main(@location(0) color: vec4<f32>) -> MyOutputs {
  var out: MyOutputs;
  out.color = color;
  return out;
}
`,
};

const Storage = makeBasicExample({
  name: 'Storage alignment example',
  description: 'Shows how structures are padded',
  slug: 'storage',
  wgslShaders,
  glslShaders,
  init,
  source: __SOURCE__,
});

export default Storage;
