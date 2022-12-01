import type { GUI } from 'dat.gui';
import { makeBasicExample } from '../../components/basicExample';
import glslangModule from '../../glslang';

async function init(canvas: HTMLCanvasElement, useWGSL: boolean, gui: GUI) {
  const perfDisplayContainer = document.createElement('div');
  perfDisplayContainer.style.color = 'white';
  perfDisplayContainer.style.background = 'black';
  perfDisplayContainer.style.position = 'absolute';
  perfDisplayContainer.style.top = '10px';
  perfDisplayContainer.style.left = '10px';

  const perfDisplay = document.createElement('pre');
  perfDisplayContainer.appendChild(perfDisplay);
  canvas.parentNode.appendChild(perfDisplayContainer);

  const params = new URLSearchParams(window.location.search);
  const settings = {
    numTriangles: Number(params.get('numTriangles')) || 20000,
    renderBundles: Boolean(params.get('renderBundles')),
    dynamicOffsets: Boolean(params.get('dynamicOffsets')),
  };

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const context = canvas.getContext('webgpu');

  const swapChainFormat = 'bgra8unorm';

  const swapChain = context.configure({
    device,
    format: swapChainFormat,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const timeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'uniform',
          minBindingSize: 4,
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'uniform',
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'read-only-storage',
        },
      },
    ],
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'uniform',
          minBindingSize: 20,
        },
      },
    ],
  });

  const dynamicBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'uniform',
          hasDynamicOffset: true,
          minBindingSize: 20,
        },
      },
    ],
  });

  const vec4Size = 4 * Float32Array.BYTES_PER_ELEMENT;
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [timeBindGroupLayout, bindGroupLayout],
  });
  const dynamicPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [timeBindGroupLayout, dynamicBindGroupLayout],
  });
  const pipelineDesc: GPURenderPipelineDescriptor = {
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
          // vertex buffer
          arrayStride: 2 * vec4Size,
          stepMode: 'vertex',
          attributes: [
            {
              // vertex positions
              shaderLocation: 0,
              offset: 0,
              format: 'float32x4',
            },
            {
              // vertex colors
              shaderLocation: 1,
              offset: vec4Size,
              format: 'float32x4',
            },
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
          format: swapChainFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'none',
    },
  };

  const pipeline = device.createRenderPipeline({
    ...pipelineDesc,
    layout: pipelineLayout,
  });

  const dynamicPipeline = device.createRenderPipeline({
    ...pipelineDesc,
    layout: dynamicPipelineLayout,
  });

  const vertexBuffer = device.createBuffer({
    size: 2 * 3 * vec4Size,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  // prettier-ignore
  new Float32Array(vertexBuffer.getMappedRange()).set([
    // position data  /**/ color data
    0, 0.1, 0, 1,     /**/ 1, 0, 0, 1,
    -0.1, -0.1, 0, 1, /**/ 0, 1, 0, 1,
    0.1, -0.1, 0, 1,  /**/ 0, 0, 1, 1,
  ]);
  vertexBuffer.unmap();

  function configure() {
    const numTriangles = settings.numTriangles;
    const uniformBytes = 5 * Float32Array.BYTES_PER_ELEMENT;
    const alignedUniformBytes = Math.ceil(uniformBytes / 256) * 256;
    const alignedUniformFloats =
      alignedUniformBytes / Float32Array.BYTES_PER_ELEMENT;
    const uniformBuffer = device.createBuffer({
      size: numTriangles * alignedUniformBytes + Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    const uniformBufferData = new Float32Array(
      numTriangles * alignedUniformFloats
    );
    const bindGroups = new Array(numTriangles);
    for (let i = 0; i < numTriangles; ++i) {
      uniformBufferData[alignedUniformFloats * i + 0] =
        Math.random() * 0.2 + 0.2; // scale
      uniformBufferData[alignedUniformFloats * i + 1] =
        0.9 * 2 * (Math.random() - 0.5); // offsetX
      uniformBufferData[alignedUniformFloats * i + 2] =
        0.9 * 2 * (Math.random() - 0.5); // offsetY
      uniformBufferData[alignedUniformFloats * i + 3] =
        Math.random() * 1.5 + 0.5; // scalar
      uniformBufferData[alignedUniformFloats * i + 4] = Math.random() * 10; // scalarOffset

      bindGroups[i] = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: uniformBuffer,
              offset: i * alignedUniformBytes,
              size: 6 * Float32Array.BYTES_PER_ELEMENT,
            },
          },
        ],
      });
    }

    const dynamicBindGroup = device.createBindGroup({
      layout: dynamicBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
            offset: 0,
            size: 6 * Float32Array.BYTES_PER_ELEMENT,
          },
        },
      ],
    });

    const numParticles = 1;
    const initialParticleData = new Float32Array(numParticles * 4);
    for (let i = 0; i < numParticles; ++i) {
      initialParticleData[4 * i + 0] = 0;
      initialParticleData[4 * i + 1] = 1;
      initialParticleData[4 * i + 2] = 0;
      initialParticleData[4 * i + 3] = 1;
    }

    const particleBuffers: GPUBuffer[] = new Array(2);
    for (let i = 0; i < 2; ++i) {
      particleBuffers[i] = device.createBuffer({
        size: initialParticleData.byteLength,
        usage:  GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        mappedAtCreation: true,
      });
      new Float32Array(particleBuffers[i].getMappedRange()).set(
        initialParticleData
      );
      particleBuffers[i].unmap();
    }

    const timeOffset = numTriangles * alignedUniformBytes;
    const timeBindGroup = device.createBindGroup({
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
            offset: timeOffset,
            size: Float32Array.BYTES_PER_ELEMENT,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: particleBuffers[0],
            offset: 0,
            size: initialParticleData.byteLength,
          },
        }
      ],
    });

    // writeBuffer too large may OOM. TODO: The browser should internally chunk uploads.
    const maxMappingLength =
      (14 * 1024 * 1024) / Float32Array.BYTES_PER_ELEMENT;
    for (
      let offset = 0;
      offset < uniformBufferData.length;
      offset += maxMappingLength
    ) {
      const uploadCount = Math.min(
        uniformBufferData.length - offset,
        maxMappingLength
      );

      device.queue.writeBuffer(
        uniformBuffer,
        offset * Float32Array.BYTES_PER_ELEMENT,
        uniformBufferData.buffer,
        uniformBufferData.byteOffset + offset * Float32Array.BYTES_PER_ELEMENT,
        uploadCount * Float32Array.BYTES_PER_ELEMENT
      );
    }

    function recordRenderPass(
      passEncoder: GPURenderBundleEncoder | GPURenderPassEncoder
    ) {
      if (settings.dynamicOffsets) {
        passEncoder.setPipeline(dynamicPipeline);
      } else {
        passEncoder.setPipeline(pipeline);
      }
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, timeBindGroup);
      const dynamicOffsets = [0];
      for (let i = 0; i < numTriangles; ++i) {
        if (settings.dynamicOffsets) {
          dynamicOffsets[0] = i * alignedUniformBytes;
          passEncoder.setBindGroup(1, dynamicBindGroup, dynamicOffsets);
        } else {
          passEncoder.setBindGroup(1, bindGroups[i]);
        }
        passEncoder.draw(3, 1, 0, 0);
      }
    }

    let startTime = undefined;
    const uniformTime = new Float32Array([0]);

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: undefined, // Assigned later
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        },
      ],
    };

    const renderBundleEncoder = device.createRenderBundleEncoder({
      colorFormats: [swapChainFormat],
    });
    recordRenderPass(renderBundleEncoder);
    const renderBundle = renderBundleEncoder.finish();

    return function doDraw(timestamp) {
      if (startTime === undefined) {
        startTime = timestamp;
      }
      uniformTime[0] = (timestamp - startTime) / 1000;
      device.queue.writeBuffer(uniformBuffer, timeOffset, uniformTime.buffer);

      renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

      if (settings.renderBundles) {
        passEncoder.executeBundles([renderBundle]);
      } else {
        recordRenderPass(passEncoder);
      }

      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);
    };
  }

  let doDraw = configure();

  const updateSettings = () => {
    doDraw = configure();
  };
  gui
    .add(settings, 'numTriangles', 0, 200000)
    .step(1)
    .onFinishChange(updateSettings);
  gui.add(settings, 'renderBundles');
  gui.add(settings, 'dynamicOffsets');

  let previousFrameTimestamp = undefined;
  let jsTimeAvg = undefined;
  let frameTimeAvg = undefined;
  let updateDisplay = true;

  return function frame(timestamp) {
    let frameTime = 0;
    if (previousFrameTimestamp !== undefined) {
      frameTime = timestamp - previousFrameTimestamp;
    }
    previousFrameTimestamp = timestamp;

    const start = performance.now();
    doDraw(timestamp);
    const jsTime = performance.now() - start;
    if (frameTimeAvg === undefined) {
      frameTimeAvg = frameTime;
    }
    if (jsTimeAvg === undefined) {
      jsTimeAvg = jsTime;
    }

    const w = 0.2;
    frameTimeAvg = (1 - w) * frameTimeAvg + w * frameTime;
    jsTimeAvg = (1 - w) * jsTimeAvg + w * jsTime;

    if (updateDisplay) {
      perfDisplay.innerHTML = `Avg Javascript: ${jsTimeAvg.toFixed(
        2
      )} ms\nAvg Frame: ${frameTimeAvg.toFixed(2)} ms`;
      updateDisplay = false;
      setTimeout(() => {
        updateDisplay = true;
      }, 100);
    }
  };
}

const glslShaders = {
  vertex: `#version 450
  layout(std140, set = 0, binding = 0) uniform Time {
      float time;
  };
  layout(std140, set = 1, binding = 0) uniform Uniforms {
      float scale;
      float offsetX;
      float offsetY;
      float scalar;
      float scalarOffset;
  };

  struct Particle {
    vec2 pos;
    vec2 vel;
  };

  struct Particles {
    Particle particles[1];
  };

  layout(std140, set = 0, binding = 1) uniform ParticlesSSO { Particles particlesB; };
  

  layout(location = 0) in vec4 position;
  layout(location = 1) in vec4 color;

  layout(location = 0) out vec4 v_color;

  void main() {
      float fade = mod(scalarOffset + time * scalar / 10.0, 1.0);
      if (fade < 0.5) {
          fade = fade * 2.0;
      } else {
          fade = (1.0 - fade) * 2.0;
      }
      float xpos = position.x * scale;
      float ypos = position.y * scale;
      float angle = 3.14159 * 2.0 * fade;
      float xrot = xpos * cos(angle) - ypos * sin(angle);
      float yrot = xpos * sin(angle) + ypos * cos(angle);
      xpos = xrot + offsetX;
      ypos = yrot + offsetY;
      //v_color = vec4(fade, 1.0 - fade, 0.0, 1.0) + color;
      v_color = vec4(particlesB.particles[0].pos.x, particlesB.particles[0].pos.y, particlesB.particles[0].vel.x, particlesB.particles[0].vel.y);
      gl_Position = vec4(xpos, ypos, 0.0, 1.0);
  }
`,

  fragment: `#version 450
  layout(location = 0) in vec4 v_color;
  layout(location = 0) out vec4 outColor;

  void main() {
      outColor = v_color;
  }
`,
};

const wgslShaders = {
  vertex: `
  struct Time {
    value : f32,
  }
  
  struct Uniforms {
    scale : f32,
    offsetX : f32,
    offsetY : f32,
    scalar : f32,
    scalarOffset : f32,
  }

  struct Particle {
    pos : vec2<f32>,
    vel : vec2<f32>,
  }

  struct Particles {
    particles : array<Particle, 1>,
  }
  
  @binding(0) @group(0) var<uniform> time : Time;
  @binding(1) @group(0) var<uniform> particlesB : Particles;
  @binding(0) @group(1) var<uniform> uniforms : Uniforms;
  @binding(2) @group(0) var<storage, read> particlesA : array<Particle>;
  
  struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) v_color : vec4<f32>,
  }
  
  @vertex
  fn main(
    @location(0) position : vec4<f32>,
    @location(1) color : vec4<f32>
  ) -> VertexOutput {
    var fade : f32 = (uniforms.scalarOffset + time.value * uniforms.scalar / 10.0) % 1.0;
    if (fade < 0.5) {
      fade = fade * 2.0;
    } else {
      fade = (1.0 - fade) * 2.0;
    }
    var xpos : f32 = position.x * uniforms.scale;
    var ypos : f32 = position.y * uniforms.scale;
    var angle : f32 = 3.14159 * 2.0 * fade;
    var xrot : f32 = xpos * cos(angle) - ypos * sin(angle);
    var yrot : f32 = xpos * sin(angle) + ypos * cos(angle);
    xpos = xrot + uniforms.offsetX;
    ypos = yrot + uniforms.offsetY;
    
    var output : VertexOutput;
    //output.v_color = vec4<f32>(fade, 1.0 - fade, 0.0, 1.0) + color;
    output.v_color = vec4<f32>(particlesB.particles[0].pos.x, particlesB.particles[0].pos.y, particlesB.particles[0].vel.x, particlesB.particles[0].vel.y);
    output.Position = vec4<f32>(xpos, ypos, 0.0, 1.0);
    return output;
  }
`,

  fragment: `
  struct Particle {
    pos : vec2<f32>,
    vel : vec2<f32>,
  }

  struct Particles {
    particles : array<Particle, 1>,
  }
  @binding(1) @group(0) var<uniform> particlesB : Particles;
  @fragment
  fn main(@location(0) v_color : vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(particlesB.particles[0].pos.y, v_color.y, v_color.z, v_color.a);
  }
`,
};

export default makeBasicExample({
  name: 'Animometer',
  slug: 'animometer',
  description: 'A WebGPU of port of the Animometer MotionMark benchmark.',
  gui: true,
  init,
  wgslShaders,
  glslShaders,
  source: __SOURCE__,
});
