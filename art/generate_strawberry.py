"""Original plush Strawberry Gnome and berry garden assets, created in Blender.
Run: blender --background --python art/generate_strawberry.py
Writes only strawberry assets, portrait, art/strawberry-preview.png and .blend.
Characters face +Z and stand at Y=0 in exported glTF. Projectile meshes are
centered at the origin; strawberry-fruit has approximately unit radius.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

for name, color in {
    'berry-red': (.82, .075, .10), 'berry-pink': (.98, .25, .28),
    'berry-leaf': (.19, .43, .14), 'berry-leaf-light': (.40, .64, .20),
    'berry-seed': (.99, .84, .46), 'berry-shrapnel': (.009, .012, .014),
    'berry-mortar': (.22, .31, .19),
    'berry-mortar-dark': (.065, .11, .055), 'berry-rim': (.65, .72, .38),
}.items(): mat(name, color, rough=.86)

def leaf(name, loc, size, angle, color='berry-leaf'):
    obj = uv(name, loc, size, color, 12, 8)
    obj.rotation_euler.z = angle
    return obj

def berry(loc=(0, 0, 0), size=1):
    # Pear-shaped, softly pointed berry with a broad shoulder and padded leaves.
    base = Vector(loc)
    obj = uv('Plump strawberry', base, (size, size, size), 'berry-red', 24, 16)
    for vertex in obj.data.vertices:
        z = vertex.co.z
        width = .64 + .19 * z
        vertex.co.x *= width
        vertex.co.y *= width
        vertex.co.z *= .85
    for row, z in enumerate([-.60, -.30, .02, .33, .58]):
        radius = math.sqrt(1-z*z) * (.64 + .19*z)
        count = [6, 8, 10, 10, 8][row]
        for i in range(count):
            a = (i + (row % 2) * .5) * math.tau/count
            x, y = radius*math.cos(a), radius*math.sin(a)
            pos = base + Vector((x*1.015, y*1.015, z*.85))*size
            seed = uv('Cream strawberry seed', pos, (.035*size, .019*size, .070*size), 'berry-seed', 8, 6)
            seed.rotation_euler.z = a - math.pi/2
    for i in range(5):
        a = i*math.tau/5
        leaf('Soft strawberry crown', base+Vector((.23*math.cos(a), .23*math.sin(a), .77))*size, (.33*size, .13*size, .065*size), a, 'berry-leaf-light')
    rod('Little berry stem', base+Vector((0,0,.76))*size, base+Vector((.04,0,1.0))*size, .045*size, 'berry-leaf')

assets = {}
reset(); gnome('strawberry', 'berry-red')
for obj in parts:
    if obj.name.startswith('Woven plaid stripe'):
        obj.data.materials.clear(); obj.data.materials.append(M['berry-pink'] if len(obj.name)%2 else M['berry-leaf'])
    elif obj.name.startswith(('Red pompom','Pompom fluff')):
        obj.data.materials.clear(); obj.data.materials.append(M['berry-leaf-light'])
torus('Green knitted hat cuff', (0,0,.845), .363, .027, 'berry-leaf')
# Cream stitches turn the drooping red hat into a strawberry without hiding its silhouette.
for z,r,count in [(1.005,.308,9),(1.15,.242,8),(1.29,.183,6)]:
    for i in range(count):
        a=(i+.25)*math.tau/count
        obj=uv('Berry hat seed', (.015+r*math.cos(a),.012+r*math.sin(a),z), (.018,.014,.037), 'berry-seed', 8, 6)
        obj.rotation_euler.z=a-math.pi/2
for i in range(3):
    a=-math.pi/2+(i-1)*.55
    leaf('Hat leaf accent', (.30+.07*math.cos(a),-.015+.07*math.sin(a),1.40), (.105,.036,.022), a)
# Chunky upward-pointing mortar cradled beside the gnome. It has a real hollow
# mouth and softly rounded rings rather than a painted circle on a solid barrel.
bottom=Vector((.46,-.13,.30)); top=Vector((.46,-.40,.78)); axis=(top-bottom).normalized()
rotation=axis.to_track_quat('Z','Y')
verts=[];faces=[];segments=24
for height,radius in [(0,.17),((top-bottom).length,.17),((top-bottom).length,.123),(.11,.123)]:
    for i in range(segments):
        a=i*math.tau/segments
        verts.append(bottom+rotation@Vector((radius*math.cos(a),radius*math.sin(a),height)))
for row in range(3):
    for i in range(segments):
        j=(i+1)%segments; faces.append((row*segments+i,row*segments+j,(row+1)*segments+j,(row+1)*segments+i))
faces.append(tuple(reversed(range(segments)))); faces.append(tuple(range(segments*3,segments*4)))
mesh=bpy.data.meshes.new('Hollow berry mortar');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Hollow berry mortar',mesh);bpy.context.collection.objects.link(obj);add(obj,obj.name,(0,0,0),(1,1,1),'berry-mortar')
obj.data.materials.append(M['berry-mortar-dark'])
for polygon in mesh.polygons:
    polygon.use_smooth=True
    if polygon.index>=segments*2:polygon.material_index=1
for center,r,thick in [(top,.17,.027),(bottom+axis*.07,.171,.019)]:
    obj=torus('Soft mortar barrel rim',center,r,thick,'berry-rim');obj.rotation_euler=rotation.to_euler()
uv('Mortar padded foot',(.46,-.11,.16),(.27,.23,.075),'berry-leaf',16,10)
berry((-.40,-.11,.57),.16)
# Match original boots' small offset to exact ground level.
for obj in parts:obj.location.z+=.01
assets['gnome']=export('gnome-strawberry')

reset();berry();assets['fruit']=export('strawberry-fruit')
# Flying impact seeds are black; the fruit and hat keep their cream seed details.
reset();uv('Black flying berry seed',(0,0,0),(.40,.31,1),'berry-shrapnel',12,8);assets['seed']=export('strawberry-seed')
reset()
for i in range(7):
    a=i*math.tau/7
    leaf('Strawberry patch leaf',(.27*math.cos(a),.27*math.sin(a),.17),(.34,.19,.09),a,'berry-leaf-light' if i%2 else 'berry-leaf')
for x,y,z,s in [(-.23,-.19,.22,.19),(.19,-.27,.24,.22),(.10,.11,.28,.18)]:berry((x,y,z),s)
# A tiny ivory blossom ties these new bushes to the existing garden flowers.
for i in range(5):
    a=i*math.tau/5;leaf('Strawberry blossom petal',(-.27+.055*math.cos(a),.18+.055*math.sin(a),.32),(.056,.035,.018),a,'white')
uv('Strawberry blossom center',(-.27,.18,.338),(.03,.03,.025),'gold',10,6)
assets['bush']=export('strawberry-bush')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((.08,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.0;scene.camera=cam
obj=assets['gnome'];obj.hide_render=False;obj.hide_set(False)
scene.render.filepath=os.path.join(OUT,'strawberry.png');bpy.ops.render.render(write_still=True)
assets['gnome'].location=(-.55,.3,0)
for key,loc,scale in [('fruit',(.65,.2,.5),.4),('seed',(1.20,-.1,.25),.16),('bush',(.35,-.65,0),1)]:
    obj=assets[key];obj.hide_render=False;obj.hide_set(False);obj.location=loc;obj.scale*=scale
cam.location=(2,-6,3.8);cam.rotation_euler=(Vector((.1,0,.70))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.3
scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.filepath=os.path.join(ROOT,'art','strawberry-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','strawberry.blend'),compress=True)
print('GNOMEWARD_STRAWBERRY_COMPLETE')
