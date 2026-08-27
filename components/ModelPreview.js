import React, { useEffect, useRef, useState, useMemo, memo, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PresentationControls, useGLTF, Stage, useProgress } from '@react-three/drei';
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
      // Mode E error state: type only. No frame, no tinted plate, no icon.
      return (
        <div className="va-stage-error" role="alert">
          <p>[Error] — mesh did not load.</p>
          <p>The written record is still readable.</p>
          <style jsx>{`
            .va-stage-error {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 8px;
              padding: var(--e-pad);
              color: var(--e-ink);
              font-family: var(--font-e);
              font-size: 11px;
              font-weight: 300;
              letter-spacing: var(--e-track);
              line-height: 1.6;
              text-transform: uppercase;
            }

            .va-stage-error p {
              margin: 0;
              max-width: 26ch;
            }
          `}</style>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mode E loading state: a percentage in type, drawn inside the canvas so the
// stage never sits blank while a GLB is on the wire.
const StageLoader = () => {
  const { progress } = useProgress();

  return (
    <Html center>
      <span className="va-stage-loading">[Loading mesh] — {Math.round(progress)}%</span>
      <style jsx>{`
        .va-stage-loading {
          display: block;
          white-space: nowrap;
          color: var(--e-ink);
          font-family: var(--font-e);
          font-size: 11px;
          font-weight: 300;
          letter-spacing: var(--e-track);
          text-transform: uppercase;
        }
      `}</style>
    </Html>
  );
};

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

        <Suspense fallback={<StageLoader />}>
          <Stage
            environment="city"
            intensity={0.6}
            contactShadow={false}
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
