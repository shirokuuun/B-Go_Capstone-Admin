/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useRef, useMemo, useLayoutEffect } from 'react';
import { Color } from 'three';

const hexToNormalizedRGB = hex => {
  hex = hex.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  ];
};

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  vec2 uv = rotateUvs(vUv, uRotation);
  vec2 tex = uv * uScale;
  float time = uTime * uSpeed * 0.05; // Slower, smoother time
  
  // Simple directional wave displacement
  tex.y += 0.02 * sin(tex.x * 6.0 - time);
  
  // Main silk pattern - simple flowing waves in one direction
  float pattern = sin(tex.x * 3.0 + tex.y * 2.0 - time * 2.0);
  pattern += 0.5 * sin(tex.x * 6.0 + tex.y * 1.0 - time * 1.5);
  pattern += 0.25 * sin(tex.x * 9.0 - tex.y * 0.5 - time * 1.8);
  
  // Add subtle noise for texture
  float noiseValue = noise(tex + time * 0.1);
  pattern += (noiseValue - 0.5) * uNoiseIntensity * 0.3;
  
  // Smooth gradient
  pattern = sin(pattern) * 0.5 + 0.5;
  pattern = smoothstep(0.2, 0.8, pattern);
  
  // Soft color mixing - waves on black background
  vec3 backgroundColor = vec3(0.0, 0.0, 0.0); // Black background
  vec3 color = mix(backgroundColor, uColor, pattern);
  float alpha = 1.0; // Full opacity for solid background
  
  gl_FragColor = vec4(color, alpha);
}
`;

const SilkMaterial = forwardRef(({ 
  speed = 1, 
  scale = 1, 
  color = "#7B7481", 
  noiseIntensity = 1.5, 
  rotation = 0 
}, ref) => {
  const materialRef = useRef();
  const timeRef = useRef(0);
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSpeed: { value: speed },
    uScale: { value: scale },
    uColor: { value: hexToNormalizedRGB(color) },
    uNoiseIntensity: { value: noiseIntensity },
    uRotation: { value: rotation }
  }), []);

  // Update uniforms when props change
  useMemo(() => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uSpeed.value = speed;
      materialRef.current.uniforms.uScale.value = scale;
      materialRef.current.uniforms.uColor.value = hexToNormalizedRGB(color);
      materialRef.current.uniforms.uNoiseIntensity.value = noiseIntensity;
      materialRef.current.uniforms.uRotation.value = rotation;
    }
  }, [speed, scale, color, noiseIntensity, rotation]);

  useFrame((state, delta) => {
    if (materialRef.current?.uniforms?.uTime) {
      timeRef.current += delta;
      materialRef.current.uniforms.uTime.value = timeRef.current;
    }
  });

  useLayoutEffect(() => {
    if (ref) {
      ref.current = materialRef.current;
    }
  }, [ref]);

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      transparent
      depthWrite={false}
      side={2}
    />
  );
});

SilkMaterial.displayName = 'SilkMaterial';

const SilkPlane = ({ speed, scale, color, noiseIntensity, rotation }) => {
  const { viewport } = useThree();
  
  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height, 1, 1]} />
      <SilkMaterial 
        speed={speed} 
        scale={scale} 
        color={color} 
        noiseIntensity={noiseIntensity} 
        rotation={rotation} 
      />
    </mesh>
  );
};

const Silk = ({ 
  speed = 5, 
  scale = 1, 
  color = "#7B7481", 
  noiseIntensity = 1.5, 
  rotation = 0,
  style = {}
}) => {
  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0,
      bottom: 0,
      width: '100%', 
      height: '100%', 
      zIndex: 0,
      pointerEvents: 'none',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      ...style 
    }}>
      <Canvas
        camera={{ position: [0, 0, 1], fov: 75, near: 0.1, far: 1000 }}
        gl={{ 
          antialias: true, 
          alpha: false, 
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]}
        frameloop="always"
        style={{ 
          width: '100%', 
          height: '100%',
          display: 'block',
          backgroundColor: '#000000'
        }}
      >
        <SilkPlane 
          speed={speed} 
          scale={scale} 
          color={color} 
          noiseIntensity={noiseIntensity} 
          rotation={rotation} 
        />
      </Canvas>
    </div>
  );
};

export default Silk;