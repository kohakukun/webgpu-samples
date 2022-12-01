struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragColor : vec4<f32>,
};

struct ConstantData {
  transform: mat4x4<f32>,
  primID: i32 ,
};

@binding(0) @group(0) var<storage, read> constantPrimvars : array<ConstantData>;

@vertex
fn main(
  @location(0) position : vec3<f32>)
     -> VertexOutput {
  var color : vec4<f32>;
  if (constantPrimvars[0].primID == 42 && constantPrimvars[1].primID == 16) {
    color = vec4(1.0, 0.0, 1.0, 1); // correct
  } else {
    color = vec4(0.0, 0.0, 1.0, 1);
  }

  return VertexOutput(vec4<f32>(position*0.001, 1), color);
}