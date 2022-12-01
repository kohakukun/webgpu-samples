import { makeBasicExample } from '../../components/basicExample';
import glslangModule from '../../glslang';

async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const context = canvas.getContext('webgpu');

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const indices = [0, 1, 2];
  const vertexData = [-1, 3, 0, 1, 0, 2, -1, -1, 0, 1, 0, 0, 3, -1, 0, 1, 2, 0];

  const uniformBuffer = device.createBuffer({
    size: 2 * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  new Uint32Array(uniformBuffer.getMappedRange()).set([0, 1]);
  uniformBuffer.unmap();

  // Create the model index buffer.
  const vertexBuffer = device.createBuffer({
    size: vertexData.length * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Uint32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  // Create the model index buffer.
  const indexBuffer = device.createBuffer({
    size: indices.length * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint32Array(indexBuffer.getMappedRange()).set(indices);
  indexBuffer.unmap();

  const swapChain = context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: glslShaders.vertex,
        transform: (glsl) => glslang.compileGLSL(glsl, 'vertex'),
      }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: 'float32x4',
            },
            {
              // position
              shaderLocation: 1,
              offset: Float32Array.BYTES_PER_ELEMENT * 4,
              format: 'float32x2',
            },
          ],
        }
      ],
    },
    fragment: {
      module: device.createShaderModule({
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

  // Fetch the image and upload it into a GPUTexture.
  let cubeTexture: GPUTexture;
  {
    const img = document.createElement('img');
    img.src = require('../../../assets/img/Di-3d.png');
    await img.decode();
    const imageBitmap = await createImageBitmap(img);

    cubeTexture = device.createTexture({
      size: [imageBitmap.width, imageBitmap.height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture: cubeTexture },
      [imageBitmap.width, imageBitmap.height]
    );
  }

  // Create a sampler with linear filtering for smooth interpolation.
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: 2 * Uint32Array.BYTES_PER_ELEMENT,
        },
      },
    ],
  });
  const textureBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: cubeTexture.createView(),
      },
    ],
  });
  const samplerBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(2),
    entries: [
      {
        binding: 0,
        resource: sampler,
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
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setBindGroup(1, textureBindGroup);
    passEncoder.setBindGroup(2, samplerBindGroup);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.drawIndexed(6, 1, 0, 4, 0);

    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  return frame;
}

const glslShaders = {
  vertex: `#version 460
  #define IS_WGPU 1
  #define REF(space,type) inout type
  #define FORWARD_DECL(func_decl) func_decl
  #define ATOMIC_LOAD(a) (a)
  #define ATOMIC_STORE(a, v) (a) = (v)
  #define ATOMIC_ADD(a, v) atomicAdd(a, v)
  #define ATOMIC_EXCHANGE(a, v) atomicExchange(a, v)
  #define atomic_int int
  #define atomic_uint uint
  
  #define HGI_HAS_DOUBLE_TYPE 1
  
  #define gl_BaseInstance 0
  
  struct hgi_ivec3 { int    x, y, z; };
  struct hgi_vec3  { float  x, y, z; };
  struct hgi_dvec3 { double x, y, z; };
  struct hgi_mat3  { float  m00, m01, m02,
                            m10, m11, m12,
                            m20, m21, m22; };
  struct hgi_dmat3 { double m00, m01, m02,
                            m10, m11, m12,
                            m20, m21, m22; };
  
  #define centroid
  
  
  // //////// Global Includes ////////
  
  // //////// Global Macros ////////
  
  // //////// Global Structs ////////
  
  // //////// Global Member Declarations ////////
  layout(location = 0) in vec4 position;
  layout(location = 1) in vec2 uvIn;
  layout(location = 0) out vec2 uvOut;
  
  // //////// Global Function Definitions ////////
  
  // line 41 \"/Users/munoza/Documents/Repos/USDBuilds/arm64/lib/usd/hdx/resources/shaders/colorCorrection.glslfx\"
  
  void main(void)
  {
      gl_Position = position;
      uvOut = uvIn;
  }
`,

  fragment: `#version 460
  #define IS_WGPU 1
  #define REF(space,type) inout type
  #define FORWARD_DECL(func_decl) func_decl
  #define ATOMIC_LOAD(a) (a)
  #define ATOMIC_STORE(a, v) (a) = (v)
  #define ATOMIC_ADD(a, v) atomicAdd(a, v)
  #define ATOMIC_EXCHANGE(a, v) atomicExchange(a, v)
  #define atomic_int int
  #define atomic_uint uint
  
  #define HGI_HAS_DOUBLE_TYPE 1
  
  #define gl_BaseInstance 0
  
  struct hgi_ivec3 { int    x, y, z; };
  struct hgi_vec3  { float  x, y, z; };
  struct hgi_dvec3 { double x, y, z; };
  struct hgi_mat3  { float  m00, m01, m02,
                            m10, m11, m12,
                            m20, m21, m22; };
  struct hgi_dmat3 { double m00, m01, m02,
                            m10, m11, m12,
                            m20, m21, m22; };
  
  #define centroid

  layout(std140, binding = 0) uniform ParamBuffer
  {
          vec2 screenSize;
  
  };
  layout(binding = 0, set = 2) uniform sampler samplerBind_colorIn;
  layout(binding = 0, set = 1) uniform texture2D textureBind_colorIn;
  layout(location = 0) in vec2 uvOut;
  layout(location = 0) out vec4 hd_FragColor;
  
  // //////// Global Function Definitions ////////
  #define HgiGetSampler_textureBind_colorIn() textureBind_colorIn
  vec4 HgiGet_colorIn(vec2 uv) {
      vec4 result = texture(sampler2D(textureBind_colorIn, samplerBind_colorIn), uv);
      return result;
  }
  ivec2 HgiGetSize_colorIn() {
      return textureSize(sampler2D(textureBind_colorIn, samplerBind_colorIn), 0);
  }
  vec4 HgiTextureLod_colorIn(vec2 coord, float lod) {
      return textureLod(sampler2D(textureBind_colorIn, samplerBind_colorIn), coord, lod);
  }
  vec4 HgiTexelFetch_colorIn(ivec2 coord) {
      vec4 result = texelFetch(sampler2D(textureBind_colorIn, samplerBind_colorIn), coord, 0);
      return result;
  }
  
  // line 49 \"/Users/munoza/Documents/Repos/USDBuilds/arm64/lib/usd/hdx/resources/shaders/colorCorrection.glslfx\"
  
  // Similar to D3DX_DXGIFormatConvert.inl, but branchless
  // https://www.shadertoy.com/view/wds3zM
  vec3 FloatToSRGB(vec3 val)
  {
      val = mix((val * 12.92),
                (1.055 * pow(val, vec3(1.0/2.4)) - 0.055),
                step(0.0031308, val));
      return val;
  }
  
  void main(void)
  {
      vec2 fragCoord = uvOut * screenSize;
      vec4 inCol = HgiTexelFetch_colorIn(ivec2(fragCoord));
  
      #if defined(GLSLFX_USE_OCIO)
          inCol = OCIODisplay(inCol, Lut3DIn);
      #else
          // Only color, not alpha is gamma corrected!
          inCol.rgb = FloatToSRGB(inCol.rgb);
      #endif
  
      //hd_FragColor = inCol;
      hd_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
  }
`,
};


// import ma from '../../components/BasicExample';

const HelloTriangle = makeBasicExample({
  name: 'Hello Triangle',
  description: 'Shows rendering a basic triangle.',
  slug: 'helloTriangle',
  wgslShaders: { vertex: '', fragment: '' },
  glslShaders,
  init,
  source: __SOURCE__,
});

export default HelloTriangle;
