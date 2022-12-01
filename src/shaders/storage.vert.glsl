#version 450
struct ConstantData7 {
  mat4 transform;
  int primID;
};

layout(location = 0) in vec3 position;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) readonly buffer ssbo_constantPrimvars { ConstantData7 constantPrimvars[];};

void main() {
  if (constantPrimvars[0].primID == 42 && constantPrimvars[1].primID == 16) {
      fragColor = vec4(1.0, 0.0, 1.0, 1); // correct
  } else {
    fragColor = vec4(0.0, 0.0, 1.0, 1);
  }
  gl_Position = vec4(position * 0.001, 1.0);
}