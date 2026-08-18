import React, { useEffect, useRef, useState, useMemo, memo, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PresentationControls, useGLTF, Stage } from '@react-three/drei';
import { Suspense } from 'react';

// Error Boundary for Three.js Canvas
class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Model Loading Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[#f1efe8] border border-black/10 p-6 text-center">
          <div className="w-12 h-12 mb-4 border border-black/20" />
          <h4 className="text-[10px] font-medium uppercase tracking-[0.18em] text-black/75 mb-2">Preview unavailable</h4>
          <p className="text-[10px] text-black/50 leading-relaxed max-w-[180px]">
            The model could not be loaded.
            <br />
            The archive record is still available.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global cache object
const modelCache = {};

// Optimized loaded component
const Model = ({ modelPath, scale, rotationY, position }) => {
  const { scene } = useGLTF(modelPath);
  const meshRef = useRef();

  const modelScene = useMemo(() => {
    return scene.clone();
  }, [scene]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotationY * (Math.PI / 180);
    }
  }, [rotationY]);

  return (
    <primitive
      ref={meshRef}
      object={modelScene}
      scale={scale}
      position={position}
    />
  );
};

// Preload helper
export const preloadModels = (modelPaths) => {
  modelPaths.forEach(path => {
    if (!modelCache[path]) {
      try {
        useGLTF.preload(path);
        modelCache[path] = true;
      } catch (e) { }
    }
  });
};

const ModelPreview = memo(({
  modelPath,
  scale = 1,
  intensity = 1.5,
  rotationY = 0,
  autoRotateSpeed = 2,
  fov = 45,
  adjustCamera = true,
  cameraDistance,
  // Geometric-origin correction: some exported GLBs don't have their pivot
  // at the visual center, which flings them out of frame once autoRotate is
  // on. This nudges the mesh back into place without touching the source file.
  position = [0, 0, 0],
}) => {
  if (!modelPath) return null;

  return (
    <ModelErrorBoundary key={modelPath}>
      <Canvas shadows camera={{ position: [0, 0, 4], fov: fov }} gl={{ preserveDrawingBuffer: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.18} penumbra={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={intensity * 0.85} />

        <Suspense fallback={null}>
          <Stage
            environment="city"
            intensity={0.6}
            contactShadow={{ opacity: 0.2, blur: 2 }}
            adjustCamera={cameraDistance ?? adjustCamera}
          >
            <PresentationControls
              global
              config={{ mass: 2, tension: 500 }}
              snap={{ mass: 4, tension: 1500 }}
              rotation={[0, 0, 0]}
              polar={[-Math.PI / 3, Math.PI / 3]}
              azimuth={[-Math.PI / 1.4, Math.PI / 1.4]}
            >
              <Model
                modelPath={modelPath}
                scale={scale}
                rotationY={rotationY}
                position={position}
              />
            </PresentationControls>
          </Stage>
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          autoRotate={autoRotateSpeed > 0}
          autoRotateSpeed={autoRotateSpeed}
        />
      </Canvas>
    </ModelErrorBoundary>
  );
});

ModelPreview.displayName = 'ModelPreview';

export default ModelPreview;
