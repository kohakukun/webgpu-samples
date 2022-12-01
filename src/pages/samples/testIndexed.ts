import { makeBasicExample } from '../../components/basicExample';
import glslangModule from '../../glslang';

async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const context = canvas.getContext('webgpu');

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const indices = [
    0, 2, 1, 2, 0, 3,
    2, 0, 3,0, 2, 1,
  ];
  const vertices = [
    -230, 0, 150,
    630, 0, 150,
    630, 290, 150,
    -230, 290, 150,

    -430, -245, 0,
    430, -245, 0,
    430, 45, 0,
    -430, 45, 0,
  ];

  const colors = [
    1.0, 0.0, 0.0,
    0.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,

    1.0, 1.0, 0.0,
    1.0, 0.0, 1.0,
    0.0, 1.0, 1.0,
    1.0, 1.0, 1.0,
  ];



  const transform0 = [
    100, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  const transformInverse0 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]
  const bboxLocalMin0 = [1,-100,150, 1];
  const bboxLocalMax0 = [630, 190, 150, 2];
  const primID0 = [42];
  
  const padding0 = [0, 0, 0];
  
  const transform1 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  const transformInverse1 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  
  const bboxLocalMin1=[-430, -145, 0, 1];
  const bboxLocalMax1=[430, 145,0,1];
  const primID1 = [1];
  const padding1 = [0, 0, 0];

  const constParamsData0 = [].concat(transform0, transformInverse0, bboxLocalMin0, bboxLocalMax0, primID0);
  const constParamsData1 = [].concat(transform1, transformInverse1, bboxLocalMin1, bboxLocalMax1, primID1);
  const constParamsData = [].concat(constParamsData0, constParamsData1);
  window.constParamsData = constParamsData;

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

  // Create vertex color
  const colorBuffer = device.createBuffer({
    size: colors.length * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(colorBuffer.getMappedRange()).set(colors);
  colorBuffer.unmap();

  const swapChain = context.configure({
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
        {
          arrayStride: 0,
          attributes: [
            {
              // position
              shaderLocation: 1,
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
    passEncoder.setVertexBuffer(1, colorBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.setBindGroup(0, bindGroup);
    //drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance)
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.drawIndexed(6, 1, 0, 4, 0);

    /*
    passEncoder.setVertexBuffer(1, colorBuffer, 4*3*2);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.drawIndexed(6, 1, 6, 0, 0);
    */

    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  return frame;
}

const glslShaders = {
  vertex: `#version 450
const vec2 pos[3] = vec2[3](vec2(0.0f, 0.5f), vec2(-0.5f, -0.5f), vec2(0.5f, -0.5f));

void main() {
    gl_Position = vec4(pos[gl_VertexIndex], 0.0, 1.0);
}
`,

  fragment: `#version 450
  layout(location = 0) out vec4 outColor;

  void main() {
      outColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`,
};

const wgslShaders = {
  vertex: `

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragColor : vec4<f32>,
};

struct ConstantData7 {
  transform: mat4x4<f32>,
  transformInverse: mat4x4<f32> ,
  bboxLocalMin: vec4<i32> ,
  bboxLocalMax: vec4<i32> ,
  primID: i32 ,
};

struct ConstantDataArr {
  data : array<ConstantData7>,
};

const colors : array<vec4<f32>, 8> = array<vec4<f32>, 8>(
  vec4<f32>(0.0, 0.0, 0.0, 1.0),
  vec4<f32>(1.0, 0.0, 0.0, 1.0),
  vec4<f32>(0.0, 1.0, 0.0, 1.0),
  vec4<f32>(0.0, 0.0, 1.0, 1.0),
  vec4<f32>(1.0, 1.0, 0.0, 1.0),
  vec4<f32>(0.0, 1.0, 1.0, 1.0),
  vec4<f32>(1.0, 0.0, 1.0, 1.0),
  vec4<f32>(1.0, 1.0, 1.0, 1.0),
);

const hardCodedpositions : array<vec3<f32>, 8> = array<vec3<f32>, 8>(
  vec3<f32>(-230.000000, 0.000000, 150.000000),
  vec3<f32>(630.000000, 0.000000, 150.000000),
  vec3<f32>(630.000000, 290.000000, 150.000000),
  vec3<f32>(-230.000000, 290.000000, 150.000000),
  vec3<f32>(-430.000000, -245.000000, 0.000000),
  vec3<f32>(430.000000, -245.000000, 0.000000),
  vec3<f32>(430.000000, 45.000000, 0.000000),
  vec3<f32>(-430.000000, 45.000000, 0.000000),
);
@binding(0) @group(0) var<storage, read> constantPrimvars : ConstantDataArr;


@vertex
fn main(
  @builtin(vertex_index) my_index: u32,
  @location(0) position : vec3<f32>,
  @location(1) color : vec3<f32>)
     -> VertexOutput {
  //return VertexOutput(vec4<f32>(position*0.001, 1), colors[my_index]);
  if (constantPrimvars.data[0].transform[0][0] == 100) {
    return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(1.0, 1.0, 1.0, 1));
  } else {
    if (constantPrimvars.data[0].primID == 42) {
      
      if (constantPrimvars.data[2].primID == 42) {
        return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(1.0, 0.0, 1.0, 1));
      } else if (constantPrimvars.data[1].primID == 1) {
        return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(0.0, 0.0, 0.0, 1));
      } else {
        return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(1.0, 0.0, 0.0, 1));
      }
      
    } else if (constantPrimvars.data[0].primID == 1) {
      return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(0.0, 1.0, 1.0, 1));
    } else {
      return VertexOutput(vec4<f32>(hardCodedpositions[my_index]*0.001, 1), vec4<f32>(0.0, 0.0, 1.0, 1));
    }
  }
  
  

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

// import ma from '../../components/BasicExample';

const HelloTriangle = makeBasicExample({
  name: 'Hello Triangle',
  description: 'Shows rendering a basic triangle.',
  slug: 'helloTriangle',
  wgslShaders,
  glslShaders,
  init,
  source: __SOURCE__,
});

export default HelloTriangle;
