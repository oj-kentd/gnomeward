"""Blender-authored Skeletor costume for Gnomeward's plush necromancer.

Run: blender --background --python art/generate_necro_skin.py
Writes only gnome-necro-skeletor.glb, necro-skeletor.png,
art/necro-skin-preview.png and art/necro-skin.blend.
The costume is cosmetic; its grounded silhouette matches the original gnome.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

mat('skeletor-violet', (.30, .055, .55), rough=.84)
mat('skeletor-purple-seam', (.46, .13, .69), rough=.86)
mat('skeletor-deep-purple', (.105, .023, .21), rough=.9)
mat('skeletor-blue', (.12, .46, .78), rough=.78)
mat('skeletor-blue-light', (.34, .69, .92), rough=.8)
mat('skeletor-bone', (.98, .77, .20), rough=.83)
mat('skeletor-bone-light', (1, .90, .43), rough=.8)
mat('skeletor-eye', (.095, .035, .14), rough=.9)
mat('skeletor-beard', (.76, .84, .93), rough=.86)

reset()
gnome('necro-skeletor', 'skeletor-violet')
for obj in parts:
    name = obj.name
    material = None
    if name.startswith('Woven plaid stripe'):
        material = 'skeletor-purple-seam'
    elif name.startswith('Suede boots'):
        material = 'skeletor-deep-purple'
    elif name.startswith(('Fluffy beard', 'Pointed beard', 'Beard tuft')):
        material = 'skeletor-beard'
    elif name.startswith(('Red pompom', 'Pompom fluff', 'Mittens')):
        material = 'skeletor-blue'
    elif name.startswith('Big button nose'):
        # Keep a tiny button nose below the skull mask's triangular socket.
        obj.scale = (.065, .07, .047)
        obj.location = (0, -.47, .64)
        material = 'skeletor-bone'
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(M[material])

# Rounded hood edge frames a cheerful yellow toy skull over the familiar beard.
torus('Plush purple hood cuff', (0, 0, .84), .36, .032, 'skeletor-purple-seam')
uv('Soft skull mask', (0, -.337, .73), (.223, .132, .174), 'skeletor-bone', 24, 16)
for side in [-1, 1]:
    uv('Round skull cheek', (side*.173, -.407, .657), (.071, .060, .064), 'skeletor-bone', 16, 10)
    uv('Friendly skull eye socket', (side*.082, -.457, .767), (.057, .023, .057), 'skeletor-eye', 16, 10)
    uv('Blue eye glimmer', (side*.080, -.479, .761), (.022, .009, .026), 'skeletor-blue-light', 12, 8)
    # Soft raised eyebrows keep the face lively at portrait scale.
    brow = uv('Yellow skull brow', (side*.083, -.447, .821), (.071, .026, .019), 'skeletor-bone-light', 16, 8)
    brow.rotation_euler.y = side*.10
ico('Tiny skull nose socket', (0, -.473, .697), (.027, .015, .032), 'skeletor-eye', 2)
cube('Skull smile recess', (0, -.438, .620), (.225, .040, .059), 'skeletor-eye', .021)
for x in [-.079, -.026, .026, .079]:
    cube('Rounded golden skull tooth', (x, -.467, .626), (.043, .034, .052), 'skeletor-bone-light', .010)

# Bright blue shoulder guards and a small golden clasp retain the soft toy feel.
for side in [-1, 1]:
    uv('Blue plush shoulder', (side*.307, .005, .623), (.135, .168, .115), 'skeletor-blue', 16, 10)
uv('Golden cloak clasp', (0, -.284, .329), (.060, .039, .055), 'skeletor-bone', 12, 8)

# Ram-skull staff echoes the costume while keeping Morrow's unmistakable staff.
rod('Purple skull staff', (.44, -.12, .23), (.44, -.12, 1.05), .037, 'skeletor-deep-purple')
for z in [.39, .47, .55]:
    torus('Blue staff grip', (.44, -.12, z), .039, .012, 'skeletor-blue')
torus('Staff gold collar', (.44, -.12, 1.01), .062, .020, 'skeletor-bone')
uv('Staff soft ram skull', (.44, -.12, 1.14), (.113, .102, .128), 'skeletor-bone-light', 20, 12)
for side in [-1, 1]:
    uv('Staff dark eye', (.44+side*.042, -.21, 1.16), (.029, .017, .037), 'skeletor-eye', 12, 8)
    points = [(.44+side*x, -.105, z) for x, z in [(.080,1.22),(.135,1.255),(.179,1.223),(.183,1.162),(.149,1.128)]]
    for i in range(len(points)-1):
        rod('Curled soft ram horn', points[i], points[i+1], .028-i*.003, 'skeletor-purple-seam')
        uv('Rounded horn joint', points[i], (.028-i*.003,)*3, 'skeletor-purple-seam', 10, 7)
    uv('Rounded horn tip', points[-1], (.019,)*3, 'skeletor-purple-seam', 10, 7)
uv('Staff skull snout', (.44, -.204, 1.067), (.048, .037, .052), 'skeletor-bone', 12, 8)

# Bake the same precise floor as all other exported defenders.
bpy.context.view_layer.update()
bottom = min((obj.matrix_world @ Vector(corner)).z for obj in parts for corner in obj.bound_box)
for obj in parts:
    obj.location.z -= bottom
skin = export('gnome-necro-skeletor')
skin.hide_render = False
skin.hide_set(False)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.render.resolution_x = 320
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.world.color = (.35, .35, .35)
scene.view_settings.view_transform = 'AgX'
for name, loc, power, size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.data.energy=power
    obj.data.shape='DISK'
    obj.data.size=size
    obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8))
cam=bpy.context.object
cam.rotation_euler=(Vector((.055,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=2.0
scene.camera=cam
scene.render.filepath=os.path.join(OUT,'necro-skeletor.png')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x=900
scene.render.resolution_y=900
scene.render.filepath=os.path.join(ROOT,'art','necro-skin-preview.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','necro-skin.blend'),compress=True)
print('GNOMEWARD_NECRO_SKIN_COMPLETE')
