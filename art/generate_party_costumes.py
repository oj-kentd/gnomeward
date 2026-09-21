"""Blender toy costumes: Orange Knight Bramble and Skeleton Sprout.

Run: blender --background --python art/generate_party_costumes.py
Only writes the two costume GLBs/portraits and party-costumes blend/preview.
Orange Knight color/helmet reference: The Behemoth's official papercraft,
https://www.thebehemoth.com/papercraft/Orange_Knight_Papercraft.jpg
All geometry below is newly authored; no reference image is shipped as an asset.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

mat('knight-orange', (1, .34, .025), rough=.82)
mat('knight-orange-light', (1, .54, .07), rough=.84)
mat('knight-ivory', (.93, .92, .79), metal=.08, rough=.72)
mat('knight-steel', (.31, .35, .37), metal=.15, rough=.7)
mat('costume-charcoal', (.033, .039, .046), rough=.92)
mat('bone-white', (.93, .93, .84), rough=.87)
mat('bone-shadow', (.65, .69, .65), rough=.88)

def recolor(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(M[material])

def remove_parts(prefixes):
    for obj in list(parts):
        if obj.name.startswith(prefixes):
            parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)

def grounded_export(name):
    bpy.context.view_layer.update()
    bottom = min((obj.matrix_world @ Vector(corner)).z for obj in parts for corner in obj.bound_box)
    for obj in parts:
        obj.location.z -= bottom
    return export(name)

assets = {}
reset()
gnome('boom', 'knight-orange')
remove_parts(('Drooping wool hat', 'Wool knitted rib', 'Red pompom', 'Pompom fluff', 'Woven plaid stripe'))
for obj in parts:
    if obj.name.startswith(('Mittens', 'Suede boots')):
        recolor(obj, 'costume-charcoal')
    elif obj.name.startswith('Fluffy beard'):
        obj.scale.z *= .70
        obj.location.z += .07
    elif obj.name.startswith(('Pointed beard', 'Beard tuft')):
        obj.scale.z *= .65
        obj.location.z += .12
    elif obj.name.startswith('Big button nose'):
        obj.scale *= .68
        obj.location.z = .742

# Round toy barrel helmet with a cream cross-shaped faceplate and dark edging.
helmet = cone('Orange padded bucket helmet', (0, 0, 1.052), .372, .352, .51, 'knight-orange', 32)
for polygon in helmet.data.polygons:
    polygon.use_smooth = True
uv('Soft helmet crown', (0, 0, 1.305), (.352, .352, .048), 'knight-orange-light', 24, 12)
torus('Soft helmet bottom rim', (0, 0, .800), .370, .020, 'knight-orange-light')
# The dark outline is intentionally separate from the small eye apertures.
cube('Dark faceplate vertical outline', (0, -.349, 1.061), (.186, .075, .494), 'costume-charcoal', .025)
cube('Dark faceplate horizontal outline', (0, -.352, 1.010), (.665, .064, .201), 'costume-charcoal', .025)
cube('Ivory cross faceplate upright', (0, -.383, 1.065), (.143, .047, .466), 'knight-ivory', .019)
cube('Ivory cross faceplate arms', (0, -.386, 1.010), (.627, .042, .160), 'knight-ivory', .019)
for side in [-1, 1]:
    eye = uv('Dark knight visor eye', (side*.153, -.416, 1.025), (.065, .020, .026), 'costume-charcoal', 16, 8)
    eye.rotation_euler.y = side * -.13
    uv('Golden helmet rivet', (side*.292, -.380, .974), (.015, .012, .015), 'knight-orange-light', 10, 6)
cube('Tiny visor nose slit', (0, -.411, 1.080), (.016, .014, .044), 'costume-charcoal', .005)
# A small bent fabric tail identifies this knight as part of the gnome family.
uv('Bent orange wool tail', (.076, .06, 1.36), (.23, .17, .10), 'knight-orange', 20, 12)
uv('Orange wool tail tip', (.245, .052, 1.38), (.106, .104, .07), 'knight-orange-light', 16, 10)
uv('Little charcoal pompom', (.306, .05, 1.337), (.063, .063, .065), 'costume-charcoal', 12, 8)

# White tabard under the beard, with Orange Knight's simple orange cross.
cube('Cream knight tabard', (0, -.283, .286), (.32, .08, .253), 'knight-ivory', .045)
cube('Orange tunic cross upright', (0, -.332, .274), (.049, .018, .147), 'knight-orange', .012)
cube('Orange tunic cross arms', (0, -.334, .291), (.145, .018, .048), 'knight-orange', .012)
for side in [-1, 1]:
    uv('Rounded silver shoulder', (side*.317, .0, .632), (.125, .163, .102), 'knight-steel', 16, 10)
    uv('Ivory shoulder top', (side*.317, -.02, .687), (.110, .133, .043), 'knight-ivory', 16, 8)
# Shield at the free hand, leaving the explosive weapon clearly visible.
cube('Orange toy shield dark border', (-.39, -.185, .44), (.259, .105, .32), 'costume-charcoal', .055)
cube('Orange toy shield face', (-.39, -.246, .44), (.217, .04, .276), 'knight-orange', .039)
uv('Orange shield boss', (-.39, -.271, .44), (.044, .023, .045), 'knight-orange-light', 12, 8)
assets['boom-orange-knight'] = grounded_export('gnome-boom-orange-knight')

reset()
gnome('sprout', 'costume-charcoal')
remove_parts(('Woven plaid stripe',))
for obj in parts:
    if obj.name.startswith(('Red pompom', 'Pompom fluff', 'Mittens')):
        recolor(obj, 'bone-white')
    elif obj.name.startswith(('Slingshot handle', 'Slingshot fork')):
        recolor(obj, 'bone-white')
    elif obj.name.startswith('Slingshot elastic'):
        recolor(obj, 'orange')
    elif obj.name.startswith('Fluffy beard'):
        obj.scale = (.21, .11, .14)
        obj.location = (0, -.295, .50)
    elif obj.name.startswith('Pointed beard'):
        obj.scale *= .45
        obj.location.z = .395
    elif obj.name.startswith('Beard tuft'):
        obj.scale.z *= .5
        obj.location.z += .09
    elif obj.name.startswith('Big button nose'):
        obj.scale = (.063, .06, .045)
        obj.location = (0, -.458, .644)
        recolor(obj, 'bone-white')

# A full friendly skull face, still on the original soft hat-and-beard silhouette.
uv('Plush skull costume mask', (0, -.336, .73), (.225, .128, .166), 'bone-white', 24, 16)
for side in [-1, 1]:
    uv('Skull round cheekbone', (side*.175, -.395, .663), (.065, .055, .056), 'bone-white', 16, 10)
    uv('Skull costume eye socket', (side*.081, -.453, .760), (.058, .021, .062), 'costume-charcoal', 16, 10)
    uv('Tiny warm eye glint', (side*.079, -.472, .757), (.020, .009, .024), 'gold', 12, 8)
ico('Skull costume nose socket', (0, -.466, .693), (.026, .015, .031), 'costume-charcoal', 2)
cube('Skull costume smile', (0, -.428, .617), (.217, .035, .052), 'costume-charcoal', .020)
for x in [-.078, -.026, .026, .078]:
    cube('Soft skull tooth', (x, -.452, .622), (.044, .028, .047), 'bone-white', .010)
torus('White bone hat cuff', (0, 0, .838), .361, .017, 'bone-white')

# Crossbones stitched on the upper hat read from the overhead play camera.
for start, end in [((-.112, -.270, 1.081), (.092, -.236, 1.226)),
                   ((.112, -.270, 1.081), (-.092, -.236, 1.226))]:
    rod('White hat crossbone', start, end, .020, 'bone-white')
    for point in [start, end]:
        for offset in [-.014, .014]:
            uv('Crossbone rounded end', (point[0]+offset, point[1], point[2]), (.024, .018, .022), 'bone-white', 10, 7)

# Curved ribs over the dark suit, around the visible lower and side torso.
for z, width in [(.248, .175), (.312, .208), (.376, .236)]:
    for side in [-1, 1]:
        start = (side*.045, -.316, z)
        elbow = (side*width*.72, -.287, z+.021)
        end = (side*width, -.247, z+.048)
        rod('Costume rib stitch', start, elbow, .017, 'bone-white')
        rod('Costume rib stitch', elbow, end, .017, 'bone-white')
        uv('Costume rib soft end', end, (.018,)*3, 'bone-white', 10, 7)
rod('White stitched sternum', (0, -.325, .218), (0, -.325, .393), .019, 'bone-white')
for side in [-1, 1]:
    rod('Bone glove mark', (side*.367, -.151, .443), (side*.367, -.157, .520), .020, 'bone-shadow')
    for xoffset in [-.055, 0, .055]:
        uv('Bone boot toe', (side*.19+xoffset, -.318, .116), (.023, .023, .040), 'bone-white', 10, 7)
assets['sprout-skeleton'] = grounded_export('gnome-sprout-skeleton')

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
cam.rotation_euler=(Vector((.035,0,.74))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=1.95
scene.camera=cam
for name, obj in assets.items():
    obj.hide_render=False
    obj.hide_set(False)
    scene.render.filepath=os.path.join(OUT,name+'.png')
    bpy.ops.render.render(write_still=True)
    obj.hide_render=True
    obj.hide_set(True)

for x, obj in zip([-.78, .78], assets.values()):
    obj.location.x=x
    obj.hide_render=False
    obj.hide_set(False)
cam.location=(1.2,-6,3.0)
cam.rotation_euler=(Vector((0,0,.73))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=3.60
scene.render.resolution_x=1200
scene.render.resolution_y=800
scene.render.filepath=os.path.join(ROOT,'art','party-costumes-preview.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','party-costumes.blend'),compress=True)
print('GNOMEWARD_PARTY_COSTUMES_COMPLETE')
