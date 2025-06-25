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
    materialColor: string
    hasCustomColor: boolean
  } | null>(null)

  // NEW: Add state for file upload
  const [isLoading, setIsLoading] = useState(false)
  const [loadedModelName, setLoadedModelName] = useState("LittlestTokyo.glb")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadModelRef = useRef<(file: File) => void>() // <- NEW
  const customColorsRef = useRef<Map<THREE.Object3D, THREE.Material>>(new Map()) // NEW: Reference to custom colors
  const originalMaterialsRef = useRef<Map<THREE.Object3D, THREE.Material>>(new Map()) // NEW: Reference to original materials

  // NEW: Add state for context menu
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    targetObject: THREE.Mesh | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    targetObject: null
  })

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
          originalMaterialsRef.current.clear() // NEW: Clear original materials ref
          customColorsRef.current.clear() // NEW: Clear custom colors when loading new model

          // Scale and position the model
          gltf.scene.scale.setScalar(0.05)
          gltf.scene.position.set(0, 0, 0)
          gltf.scene.name = "loadedModel"

          let meshCount = 0
          gltf.scene.traverse((child: any) => {
            if (child.isMesh) {
              originalMaterials.set(child, child.material)
              originalMaterialsRef.current.set(child, child.material) // NEW: Store in ref too
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
        // Use custom color if available, otherwise use original material
        const materialToRestore = customColorsRef.current.get(highlighted) || originalMaterials.get(highlighted) as THREE.Material
        highlighted.material = materialToRestore
        highlighted = null
      }

      if (hits.length) {
        highlighted = hits[0].object as THREE.Mesh
        // Save original material if unseen
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

        // Get material type and color information
        let actualMaterial = selectedObject.material as THREE.Material
        let materialType = actualMaterial.constructor.name
        
        // Get color information for debugging - check custom colors first to avoid hover color
        let materialColor = "Unknown"
        let hasCustomColor = false
        
        // Check if object has custom color applied
        const customMaterial = customColorsRef.current.get(selectedObject)
        if (customMaterial && 'color' in customMaterial && customMaterial.color) {
          actualMaterial = customMaterial
          materialType = customMaterial.constructor.name
          materialColor = `#${customMaterial.color.getHexString()}`
          hasCustomColor = true
        } else {
          // Check original material if no custom color
          const originalMaterial = originalMaterialsRef.current.get(selectedObject)
          if (originalMaterial && 'color' in originalMaterial && originalMaterial.color) {
            actualMaterial = originalMaterial
            materialType = originalMaterial.constructor.name
            materialColor = `#${originalMaterial.color.getHexString()}`
            hasCustomColor = false
          } else if ('color' in actualMaterial && actualMaterial.color) {
            // Fallback to current material (but this might be hover color)
            materialColor = `#${actualMaterial.color.getHexString()}`
            hasCustomColor = false
          }
        }

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
          materialColor,
          hasCustomColor,
        })
      }
    }

    window.addEventListener("click", handleClick)

    // NEW: Right-click handler for context menu
    const handleRightClick = (event: MouseEvent) => {
      event.preventDefault() // Prevent browser context menu
      
      mouse.x = (event.clientX / width) * 2 - 1
      mouse.y = -(event.clientY / height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      const hits = raycaster.intersectObjects(clickableObjects)

      if (hits.length) {
        const clickedObject = hits[0].object as THREE.Mesh
        setContextMenu({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          targetObject: clickedObject
        })
      } else {
        setContextMenu(prev => ({ ...prev, visible: false }))
      }
    }

    window.addEventListener("contextmenu", handleRightClick)

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
      window.removeEventListener("contextmenu", handleRightClick) // NEW: cleanup right-click
      window.removeEventListener("resize", handleResize)
      controls.dispose()
      dracoLoader.dispose() // NEW: free DRACO resources
      loader.manager.removeHandler(/\.drc$/i) // optional but tidy
      renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  // NEW: Function to apply color to object
  const applyColorToObject = (object: THREE.Mesh, color: number) => {
    // Create a more robust material that works better with various models
    // Using MeshBasicMaterial which ignores lighting completely - should definitely show color
    const newMaterial = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
    })
    
    // Alternative options if Basic doesn't work (uncomment to try):
    // 1. Lambert material (simple lighting)
    // const newMaterial = new THREE.MeshLambertMaterial({
    //   color: color,
    //   side: THREE.DoubleSide,
    // })
    
    // 2. Standard material (non-metallic)
    // const newMaterial = new THREE.MeshStandardMaterial({
    //   color: color,
    //   side: THREE.DoubleSide,
    //   metalness: 0.0,        // Non-metallic
    //   roughness: 1.0,        // Fully rough (diffuse)
    //   transparent: false,
    //   opacity: 1.0,
    // })
    
    object.material = newMaterial
    
    // Store the custom color material for this object
    customColorsRef.current.set(object, newMaterial)
    
    // Hide context menu
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  // NEW: Function to remove custom color and restore original material
  const removeCustomColor = (object: THREE.Mesh) => {
    // Get the original material from our ref
    const originalMaterial = originalMaterialsRef.current.get(object)
    
    if (originalMaterial) {
      object.material = originalMaterial
    } else {
      // Fallback: create a default material
      object.material = new THREE.MeshLambertMaterial({
        color: 0x1035e2,
        side: THREE.DoubleSide,
      })
    }
    
    // Remove from custom colors map
    customColorsRef.current.delete(object)
    
    // Hide context menu
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  // NEW: Handle clicking outside context menu
  const handleClickOutside = () => {
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  return (
    <div className="flex w-full h-full overflow-hidden" onClick={handleClickOutside}>
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

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="absolute bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-30"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm text-gray-600 mb-2 px-2">Choose Color:</div>
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded transition-colors"
              onClick={() => contextMenu.targetObject && applyColorToObject(contextMenu.targetObject, 0xff0000)}
            >
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              Red
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded transition-colors"
              onClick={() => contextMenu.targetObject && applyColorToObject(contextMenu.targetObject, 0x00ff00)}
            >
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              Green
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded transition-colors"
              onClick={() => contextMenu.targetObject && applyColorToObject(contextMenu.targetObject, 0x0000ff)}
            >
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              Blue
            </button>
            {/* Show remove color option only if object has custom color */}
            {contextMenu.targetObject && customColorsRef.current.has(contextMenu.targetObject) && (
              <>
                <div className="border-t border-gray-200 my-1"></div>
                <button
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded transition-colors text-gray-700"
                  onClick={() => contextMenu.targetObject && removeCustomColor(contextMenu.targetObject)}
                >
                  <div className="w-4 h-4 border-2 border-gray-400 rounded bg-white relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-gray-400">×</span>
                    </div>
                  </div>
                  Remove Color
                </button>
              </>
            )}
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

            <div>
              <label className="block text-sm font-medium text-gray-600">Material Color</label>
              <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded flex items-center gap-2">
                <div 
                  className="w-4 h-4 border border-gray-300 rounded"
                  style={{ backgroundColor: objectInfo.materialColor }}
                ></div>
                <span>{objectInfo.materialColor}</span>
                {objectInfo.hasCustomColor && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Custom</span>
                )}
              </div>
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
