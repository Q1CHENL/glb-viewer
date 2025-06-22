"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"

export default function ThreeScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [objectInfo, setObjectInfo] = useState<{
    name: string
    dimensions: { width: number; height: number; depth: number }
    position: { x: number; y: number; z: number }
    triangles: number
    materialType: string
  } | null>(null)

  // NEW: Add state for file upload
  const [isLoading, setIsLoading] = useState(false)
  const [loadedModelName, setLoadedModelName] = useState("LittlestTokyo.glb")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadModelRef = useRef<(file: File) => void>() // <- NEW

  // --- file input handler (must be outside useEffect so JSX can see it)
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.name.toLowerCase().endsWith(".glb")) {
      loadModelRef.current?.(file) // call the real loader stored in the ref
      setObjectInfo(null) // clear side-panel info
    } else if (file) {
      alert("Please select a .glb file")
    }
  }

  useEffect(() => {
    if (!mountRef.current) return

    // Sizes
    const width = mountRef.current.clientWidth
    const height = mountRef.current.clientHeight

    // Scene, camera, renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xaaaaaa)

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    // Update camera position for building
    camera.position.set(10, 8, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    mountRef.current.appendChild(renderer.domElement)

    // Helpers
    scene.add(new THREE.AxesHelper(2))
    scene.add(new THREE.GridHelper(10, 10))

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1))
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 1.5)
    dir.position.set(5, 10, 7.5)
    scene.add(dir)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.zoomSpeed = 1.0
    // Update controls target and settings
    controls.target.set(0, 2, 0)
    controls.minDistance = 0.01
    controls.maxDistance = 50
    controls.maxPolarAngle = Math.PI / 2.1 // Prevent going under ground
    controls.update()

    // Click / hover logic
    const clickableObjects: THREE.Object3D[] = []
    const originalMaterials = new Map<THREE.Object3D, THREE.Material>()
    let highlighted: THREE.Mesh | null = null
    let selectedObject: THREE.Mesh | null = null

    // --- GLTF + DRACO loader ---------------------------------
    const loader = new GLTFLoader()

    // NEW: configure DRACO so compressed meshes can be decoded
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/") // CDN with wasm/JS decoders
    loader.setDRACOLoader(dracoLoader)

    // NEW: Function to load model from URL or File
    const loadModel = (source: string | File, fileName?: string) => {
      setIsLoading(true)

      loader.load(
        typeof source === "string" ? source : URL.createObjectURL(source),
        (gltf) => {
          console.log("Model loaded:", gltf)

          // Clear previous model
          const existingModel = scene.getObjectByName("loadedModel")
          if (existingModel) {
            scene.remove(existingModel)
          }

          // Clear previous clickable objects
          clickableObjects.length = 0
          originalMaterials.clear()

          // Scale and position the model
          gltf.scene.scale.setScalar(0.05)
          gltf.scene.position.set(0, 0, 0)
          gltf.scene.name = "loadedModel"

          let meshCount = 0
          gltf.scene.traverse((child: any) => {
            if (child.isMesh) {
              originalMaterials.set(child, child.material)
              clickableObjects.push(child)
              meshCount++

              if (!child.name) {
                child.name = `Component_${meshCount}`
              }
            }
          })

          console.log(`Model loaded with ${meshCount} interactive components`)
          scene.add(gltf.scene)
          setLoadedModelName(
            fileName || (typeof source === "string" ? source.split("/").pop() || "Unknown" : source.name),
          )
          setIsLoading(false)

          // Clean up object URL if it was a file
          if (typeof source !== "string") {
            URL.revokeObjectURL(URL.createObjectURL(source))
          }
        },
        (xhr) => {
          const progress = xhr.total ? (xhr.loaded / xhr.total) * 100 : 0
          console.log(`Model ${progress.toFixed(1)}% loaded`)
        },
        (err) => {
          console.error("Error loading model:", err)
          setIsLoading(false)
        },
      )
    }

    // make it callable from outside useEffect
    loadModelRef.current = (file: File) => loadModel(file)

    // Load default model
    loadModel("https://threejs.org/examples/models/gltf/LittlestTokyo.glb", "LittlestTokyo.glb")

    // Raycaster
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleMouseMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / width) * 2 - 1
      mouse.y = -(event.clientY / height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      const hits = raycaster.intersectObjects(clickableObjects)

      // Reset previous highlight
      if (highlighted) {
        highlighted.material = originalMaterials.get(highlighted) as THREE.Material
        highlighted = null
      }

      if (hits.length) {
        highlighted = hits[0].object as THREE.Mesh
        // Save mat if unseen
        if (!originalMaterials.has(highlighted)) originalMaterials.set(highlighted, highlighted.material)
        highlighted.material = new THREE.MeshBasicMaterial({
          color: 0x10b3e2,
          side: THREE.DoubleSide,
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)

    const handleClick = (event: MouseEvent) => {
      mouse.x = (event.clientX / width) * 2 - 1
      mouse.y = -(event.clientY / height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      const hits = raycaster.intersectObjects(clickableObjects)

      if (hits.length) {
        selectedObject = hits[0].object as THREE.Mesh

        // Calculate bounding box for dimensions
        const box = new THREE.Box3().setFromObject(selectedObject)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        // Get triangle count
        const geometry = selectedObject.geometry
        const triangles = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3

        // Get material type
        const material = selectedObject.material as THREE.Material
        const materialType = material.constructor.name

        setObjectInfo({
          name: selectedObject.name || "Unnamed Object",
          dimensions: {
            width: Math.round(size.x * 100) / 100,
            height: Math.round(size.y * 100) / 100,
            depth: Math.round(size.z * 100) / 100,
          },
          position: {
            x: Math.round(center.x * 100) / 100,
            y: Math.round(center.y * 100) / 100,
            z: Math.round(center.z * 100) / 100,
          },
          triangles: Math.floor(triangles),
          materialType,
        })
      }
    }

    window.addEventListener("click", handleClick)

    // Resize handler
    const handleResize = () => {
      const w = mountRef.current?.clientWidth ?? width
      const h = mountRef.current?.clientHeight ?? height
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", handleResize)

    // Render loop
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()

    // NEW: File upload handler
    // const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    //   const file = event.target.files?.[0]
    //   if (file && file.name.toLowerCase().endsWith(".glb")) {
    //     loadModel(file)
    //     setObjectInfo(null) // Clear any selected object info
    //   } else if (file) {
    //     alert("Please select a .glb file")
    //   }
    // }

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("click", handleClick)
      window.removeEventListener("resize", handleResize)
      controls.dispose()
      dracoLoader.dispose() // NEW: free DRACO resources
      loader.manager.removeHandler(/\.drc$/i) // optional but tidy
      renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Upload Controls */}
      <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb"
            onChange={handleFileUpload} // <- FIXED
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {isLoading ? "Loading..." : "Upload GLB"}
          </button>
          <div className="text-sm text-gray-600">
            Current: <span className="font-medium">{loadedModelName}</span>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-700">Loading 3D model...</p>
          </div>
        </div>
      )}

      <div ref={mountRef} className="flex-1 min-w-0" />
      {objectInfo && (
        <div className="w-80 flex-shrink-0 bg-white border-l border-gray-300 p-4 overflow-y-auto">
          <h3 className="text-lg font-bold mb-4 text-gray-800">Object Information</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600">Name</label>
              <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{objectInfo.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Dimensions</label>
              <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                <div>Width: {objectInfo.dimensions.width}</div>
                <div>Height: {objectInfo.dimensions.height}</div>
                <div>Depth: {objectInfo.dimensions.depth}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Position</label>
              <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                <div>X: {objectInfo.position.x}</div>
                <div>Y: {objectInfo.position.y}</div>
                <div>Z: {objectInfo.position.z}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Triangles</label>
              <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{objectInfo.triangles.toLocaleString()}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Material Type</label>
              <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{objectInfo.materialType}</p>
            </div>
          </div>

          <button
            onClick={() => setObjectInfo(null)}
            className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded transition-colors"
          >
            Close Panel
          </button>
        </div>
      )}
    </div>
  )
}
