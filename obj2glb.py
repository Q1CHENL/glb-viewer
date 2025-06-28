import os
import sys
import argparse
import trimesh
import numpy as np

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Convert all OBJ files in a directory to a single GLB file. The output will be saved in the `model` folder.')
    parser.add_argument('input_folder', nargs='?', default='obj/', help='Path to the folder containing all your OBJ files. All files will be recursively processed. (default: obj/)')
    parser.add_argument('--output-name', '-o', default='model.glb', help='Output GLB filename (default: model.glb)')
    
    args = parser.parse_args()
    
    # Input directory containing the .obj files
    obj_dir = args.input_folder
    
    # Check if input directory exists
    if not os.path.exists(obj_dir):
        print(f"Error: Input directory '{obj_dir}' does not exist.")
        sys.exit(1)
    
    if not os.path.isdir(obj_dir):
        print(f"Error: '{obj_dir}' is not a directory.")
        sys.exit(1)
    
    # Output file path for the combined .glb scene
    output_dir = 'model'
    os.makedirs(output_dir, exist_ok=True)
    output_glb = os.path.join(output_dir, args.output_name)

    # Create an empty scene to which we'll add named nodes
    scene = trimesh.Scene()

    # Recursively find all .obj files
    obj_files_found = 0
    for root, dirs, files in os.walk(obj_dir):
        for file in files:
            if file.endswith('.obj'):
                obj_files_found += 1
                obj_path = os.path.join(root, file)
                # Use the obj filename (without extension) as the node name
                node_name = os.path.splitext(os.path.basename(obj_path))[0]
                print(f"Loading {obj_path} as node '{node_name}'")
                try:
                    # Load the mesh
                    mesh = trimesh.load(obj_path)
                    
                    # Fix coordinate system: rotate -90° around X-axis
                    # This converts from Y-up (OBJ) to Z-up (GLB viewer expectation)
                    rotation_matrix = trimesh.transformations.rotation_matrix(
                        angle=np.radians(-90),  # -90 degrees
                        direction=[1, 0, 0],    # around X-axis
                        point=[0, 0, 0]
                    )
                    mesh.apply_transform(rotation_matrix)
                    
                    # Add medium grey color to the mesh
                    # mesh.visual.face_colors = [68, 156, 255, 255]  # Medium grey RGBA
                    # Add the mesh to the scene with its name
                    scene.add_geometry(mesh, node_name=node_name)
                except Exception as e:
                    print(f"Error loading {obj_path}: {e}")

    # Check if any meshes were loaded
    if not scene.geometry:
        if obj_files_found == 0:
            print(f"No .obj files found in directory '{obj_dir}'.")
        else:
            print("No .obj files were successfully loaded.")
        sys.exit(1)
    else:
        # The scene is already populated with named nodes, so we can export it directly.
        # Export the scene to a single .glb file
        try:
            scene.export(output_glb, file_type='glb')
            print(f"Successfully combined {len(scene.geometry)} mesh(es) from '{obj_dir}' into {output_glb}")
        except Exception as e:
            print(f"Error exporting scene to {output_glb}: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
