"""Blender-authored entrance direction marker for Gnomeward.
Run: blender --background --python art/generate_entry_arrow.py
Only writes public/assets/entry-arrow.glb and art/entry-arrow.blend.
The ground marker points Blender -Y / glTF +Z and has its base at zero.
"""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'assets'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    node=m.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1)
    node.inputs['Roughness'].default_value=.75
    return m

cream=material('entry-cream-outline',(.95,.91,.69))
green=material('entry-leaf-green',(.19,.53,.19))

# A shallow seven-sided arrow silhouette: tail +Y, pointed head -Y.
outline=[(-.13,.50),(.13,.50),(.13,.02),(.325,.02),(0,-.50),(-.325,.02),(-.13,.02)]

def extrude_arrow(name,scale,z0,z1,mat):
    p=[(x*scale,y*scale,z) for z in [z0,z1] for x,y in outline]
    n=len(outline)
    # The silhouette is clockwise viewed from +Z.
    faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]
    for i in range(n):j=(i+1)%n;faces.append((i,i+n,j+n,j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(p,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bevel=obj.modifiers.new('Soft painted toy edge','BEVEL');bevel.width=.012 if scale==1 else .006;bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj

objects=[extrude_arrow('Cream arrow outline',1,0,.046,cream),extrude_arrow('Green arrow inlay',.79,.045,.062,green)]
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.join();obj=bpy.context.object;obj.name='entry-arrow'
bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'entry-arrow.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art'/'entry-arrow.blend'),compress=True)
print('GNOMEWARD_ENTRY_ARROW_COMPLETE')
