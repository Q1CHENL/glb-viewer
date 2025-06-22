"use client"
import { OrbitControls, useGLTF, Grid, Html } from "@react-three/drei"
import { useRef, useState } from "react"
import { type Mesh, MeshStandardMaterial, DoubleSide } from "three"
import type { ThreeEvent } from "@react-three/fiber"
import ThreeScene from "@/components/three-scene"

function Scene() {
  const { scene } = useGLTF("/glb/scene.glb")
  const [hoveredObject, setHoveredObject] = useState<Mesh | null>(null)
  const originalMaterials = useRef(new Map())

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const mesh = event.object as Mesh

    if (!originalMaterials.current.has(mesh)) {
      originalMaterials.current.set(mesh, mesh.material)
    }

    mesh.material = new MeshStandardMaterial({
      color: 0x10b3e2,
      side: DoubleSide,
      metalness: 0.1,
      roughness: 0.3,
    })

    setHoveredObject(mesh)
    document.body.style.cursor = "pointer"
  }

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const mesh = event.object as Mesh

    if (originalMaterials.current.has(mesh)) {
      mesh.material = originalMaterials.current.get(mesh)
    }

    setHoveredObject(null)
    document.body.style.cursor = "default"
  }

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    console.log("Clicked object:", event.object.name || "Unnamed object")
  }

  // Clone the scene and add event handlers to all meshes
  const clonedScene = scene.clone()
  clonedScene.traverse((child) => {
    if (child.isMesh) {
      const mesh = child as Mesh
      // Set default material
      mesh.material = new MeshStandardMaterial({
        color: 0x1035e2,
        side: DoubleSide,
        metalness: 0.2,
        roughness: 0.7,
      })
    }
  })

  return (
    <group>
      {/* Lights */}
      <ambientLight intensity={0.4} />
      <hemisphereLight args={[0xffffff, 0x444444, 0.6]} />
      <directionalLight
        position={[5, 10, 7.5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      {/* Helpers */}
      <axesHelper args={[2]} />
      <Grid args={[10, 10]} />

      {/* 3D Model */}
      <primitive
        object={clonedScene}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />

      {/* Controls */}
      <OrbitControls target={[0, 1, 0]} zoomSpeed={10} enablePan={true} enableZoom={true} enableRotate={true} />
    </group>
  )
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="text-white text-lg">Loading 3D model...</div>
    </Html>
  )
}

export default function Home() {
  return (
    <main className="w-full h-screen">
      <ThreeScene />
    </main>
  )
}

// Preload the GLB file
useGLTF.preload("/glb/scene.glb")
